const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");

const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const pdf = require("pdf-parse");
const {GoogleGenerativeAI} = require("@google/generative-ai");

admin.initializeApp();
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// --- FUNCIÓN 1: onFileFinalized (Extracción de Texto) ---
// Extrae texto de un PDF subido y
// actualiza su estado para activar la siguiente función.
exports.onFileFinalized = onObjectFinalized({
  cpu: 2,
  memory: "1GiB",
  timeoutSeconds: 300,
}, async (event) => {
  const {bucket, name, contentType} = event.data;
  if (!contentType || !contentType.startsWith("application/pdf")) {
    return logger.log("El archivo no es un PDF.");
  }
  const bucketAdmin = admin.storage().bucket(bucket);
  try {
    const [buffer] = await bucketAdmin.file(name).download();
    const data = await pdf(buffer);
    const q = admin.firestore().collection(
        "files").where("storagePath", "==", name).limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) {
      return logger.error(`No se encontró el documento para: ${name}`);
    }
    await snapshot.docs[0].ref.update({
      extractedText: data.text,
      status: "processed",
    });
    return logger.log(`Texto extraído para: ${name}`);
  } catch (error) {
    logger.error("Error al procesar PDF:", error);
    return null;
  }
});


// --- FUNCIÓN 2: onFileProcessed (Creación de Chunks y Embeddings) ---
// Se activa cuando un archivo ha sido procesado.
// Lo divide en fragmentos (chunks)
// y genera un embedding (vector numérico)
// para cada uno, guardándolos en Firestore.
exports.onFileProcessed = onDocumentUpdated({
  document: "files/{fileId}",
  memory: "1GiB", // Aumento de memoria
}, async (event) => {
  const change = event.data;
  if (!change) return null;

  const newData = change.after.data();
  const oldData = change.before.data();

  if (oldData.status === "processed" || newData.status !== "processed") {
    return null;
  }

  const text = newData.extractedText;
  const fileRef = change.after.ref;
  logger.log(`Iniciando chunking y
    embedding para el archivo: ${newData.name}`);

  const chunks = text.split("\n").filter((chunk) => chunk.trim().length > 20);

  // Cambio de la importación
  const {VertexAI} = await import("@google-cloud/aiplatform");
  const vertexAi = new VertexAI({
    project: process.env.GCLOUD_PROJECT,
    location: "us-central1",
  });
  const model = "text-embedding-004";
  const textEmbeddingModel = vertexAi.getGenerativeModel({model});

  const batchSize = 5;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batchChunks = chunks.slice(i, i + batchSize);
    try {
      const req = {contents: batchChunks.map((content) => ({content}))};
      const res = await textEmbeddingModel.embedContents(req);
      const embeddings = res.embeddings.map((e) => e.values);

      const writePromises = batchChunks.map((chunk, j) => {
        return fileRef.collection("chunks").add({text:
          chunk, embedding: embeddings[j]});
      });
      await Promise.all(writePromises);
    } catch (error) {
      logger.error(`Error procesando
        batch de embeddings a partir del chunk ${i}:`, error);
    }
  }

  await fileRef.update({status: "indexed"});
  return logger.log(`Se crearon y guardaron
      ${chunks.length} chunks y embeddings.`);
});


// --- FUNCIÓN 3: askSaturnAI (Chat con Búsqueda Vectorial y Memoria) ---
// Función principal de chat.
// Convierte la pregunta del usuario en un embedding,
// busca los chunks más relevantes en Firestore y
// luego llama a Gemini con
// un contexto reducido y el historial del chat.
exports.askSaturnAI = onCall({
  secrets: [GEMINI_API_KEY],
  region: "us-central1",
  memory: "1GiB", // Aumento de memoria
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Usuario no autenticado.");
  }
  if (!request.data.prompt) {
    throw new HttpsError("invalid-argument", "Falta el 'prompt'.");
  }
  const {uid} = request.auth;
  const {prompt, history = []} = request.data;

  try {
    // Cambio de la importación
    const {VertexAI} = await import("@google-cloud/aiplatform");
    const vertexAi = new VertexAI({
      project: process.env.GCLOUD_PROJECT,
      location: "us-central1",
    });
    const model = "text-embedding-004";
    const textEmbeddingModel = vertexAi.getGenerativeModel({model});
    const req = {contents: [{content: prompt}]};
    const res = await textEmbeddingModel.embedContents(req);
    const questionEmbedding = res.embeddings[0].values;

    const filesSnapshot =
    await admin.firestore().collection("files")
        .where("userId", "==", uid).where("status", "==", "indexed").get();
    if (filesSnapshot.empty) {
      return {text: `No tienes documentos indexados.
        Por favor, sube y procesa un archivo PDF.`};
    }

    const allChunks = [];
    for (const doc of filesSnapshot.docs) {
      const chunksSnapshot = await doc.ref.collection("chunks").get();
      chunksSnapshot.forEach((chunkDoc) => {
        allChunks.push(chunkDoc.data());
      });
    }

    const cosineSimilarity = (vecA, vecB) => {
      let dotProduct = 0.0;
      let normA = 0.0;
      let normB = 0.0;
      for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
      }
      if (normA === 0 || normB === 0) return 0;
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    const chunksWithSimilarity = allChunks.map((chunk) => ({
      text: chunk.text,
      similarity: cosineSimilarity(questionEmbedding, chunk.embedding),
    }));

    chunksWithSimilarity.sort((a, b) => b.similarity - a.similarity);
    const topChunks = chunksWithSimilarity.slice(0, 5);
    const context = topChunks.map((c) => c.text).join("\n---\n");

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
    const geminiModel =
    genAI.getGenerativeModel({model: "gemini-1.5-flash-latest"});
    const fullPrompt = `Basándote EXCLUSIVAMENTE en
        el siguiente contexto, responde la pregunta
        del usuario de forma simple y coloquial.
        Si no puedes responder con el contexto,
        dilo amablemente.\n\nCONTEXTO:\n${context}\n\nPREGUNTA:
        "${prompt}"`;

    const chat = geminiModel.startChat({history});
    const result = await chat.sendMessage(fullPrompt);

    return {text: result.response.text()};
  } catch (error) {
    logger.error("Error en askSaturnAI:", error);
    throw new HttpsError("internal",
        "No se pudo obtener una respuesta de la IA.");
  }
});
