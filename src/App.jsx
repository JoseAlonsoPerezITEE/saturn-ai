import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

// Firebase imports
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, query, where, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, orderBy } from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { getFunctions, httpsCallable } from 'firebase/functions';


// --- INICIO DE LA CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);
// --- FIN DE LA CONFIGURACIÓN DE FIREBASE ---

// --- Iconos SVG --- (Omitidos por brevedad, son los mismos de v2 más algunos nuevos)
const DashboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>;
const ChatIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const SendIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;
const UploadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>;
const DeleteIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const FilePdfIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;


// --- VISTA DE CHAT ---
function ChatView({ user }) {
    const [chats, setChats] = useState([]);
    const [activeChatId, setActiveChatId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loadingAI, setLoadingAI] = useState(false);
    const messagesEndRef = useRef(null);

    // Cargar la lista de chats del usuario
    useEffect(() => {
        const q = query(collection(db, 'chats'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const chatsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setChats(chatsData);
            if (!activeChatId && chatsData.length > 0) {
                setActiveChatId(chatsData[0].id);
            }
        });
        return unsubscribe;
    }, [user.uid, activeChatId]);

    // Cargar los mensajes del chat activo
    useEffect(() => {
        if (!activeChatId) return;
        const q = query(collection(db, 'chats', activeChatId, 'messages'), orderBy('timestamp'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messagesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(messagesData);
        });
        return unsubscribe;
    }, [activeChatId]);

    // Scroll al último mensaje
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleNewChat = async () => {
        const newChatName = `Conversación ${chats.length + 1}`;
        const newChatRef = await addDoc(collection(db, 'chats'), {
            userId: user.uid,
            name: newChatName,
            createdAt: serverTimestamp(),
        });
        setActiveChatId(newChatRef.id);
    };
    
    const handleRenameChat = async (chatId, currentName) => {
        const newName = prompt("Introduce el nuevo nombre:", currentName);
        if (newName && newName.trim() !== "") {
            await updateDoc(doc(db, 'chats', chatId), { name: newName.trim() });
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || !activeChatId || loadingAI) return;

        const userMessage = { role: 'user', text: input, timestamp: serverTimestamp() };
        setInput('');
        await addDoc(collection(db, 'chats', activeChatId, 'messages'), userMessage);
        
        setLoadingAI(true);
        try {
            const askSaturnAI = httpsCallable(functions, 'askSaturnAI');
            const result = await askSaturnAI({ prompt: input });
            const aiMessage = { role: 'model', text: result.data.text, timestamp: serverTimestamp() };
            await addDoc(collection(db, 'chats', activeChatId, 'messages'), aiMessage);
        } catch (error) {
            console.error("Error llamando a la función:", error);
            const errorMessage = { role: 'model', text: 'Lo siento, ocurrió un error al procesar tu pregunta.', timestamp: serverTimestamp() };
            await addDoc(collection(db, 'chats', activeChatId, 'messages'), errorMessage);
        } finally {
            setLoadingAI(false);
        }
    };

    return (
        <div className="flex h-full">
            {/* Barra lateral de chats */}
            <div className="w-1/4 bg-gray-800 p-4 flex flex-col">
                <button onClick={handleNewChat} className="flex items-center justify-center w-full px-4 py-2 mb-4 bg-indigo-600 hover:bg-indigo-700 rounded-md font-semibold transition-colors">
                    <PlusIcon /> <span className="ml-2">Nueva Conversación</span>
                </button>
                <div className="flex-grow overflow-y-auto">
                    {chats.map(chat => (
                        <div key={chat.id} onClick={() => setActiveChatId(chat.id)}
                             className={`flex justify-between items-center p-3 my-1 rounded-md cursor-pointer transition-colors ${activeChatId === chat.id ? 'bg-indigo-500' : 'hover:bg-gray-700'}`}>
                            <p className="truncate flex-grow">{chat.name}</p>
                            <button onClick={(e) => { e.stopPropagation(); handleRenameChat(chat.id, chat.name);}} className="ml-2 p-1 hover:bg-gray-600 rounded-full"><EditIcon/></button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Ventana de chat principal */}
            <div className="flex-1 flex flex-col bg-gray-700">
                <div className="flex-1 p-6 overflow-y-auto">
                    {messages.length === 0 && (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-gray-400">Envía un mensaje para comenzar a chatear con Saturn AI.</p>
                        </div>
                    )}
                    {messages.map(msg => (
                        <div key={msg.id} className={`my-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`p-4 rounded-2xl max-w-2xl prose ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-200 rounded-bl-none'}`}>
                                <ReactMarkdown children={msg.text} />
                            </div>
                        </div>
                    ))}
                    {loadingAI && (
                        <div className="my-4 flex justify-start">
                             <div className="p-4 rounded-2xl max-w-2xl bg-gray-800 text-gray-200 rounded-bl-none">
                                <p className="animate-pulse">Saturn AI está pensando...</p>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="p-4 bg-gray-800 border-t border-gray-600">
                    <form onSubmit={handleSendMessage} className="flex items-center">
                        <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
                               className="flex-1 p-3 bg-gray-700 rounded-full border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                               placeholder="Escribe tu pregunta aquí..." />
                        <button type="submit" disabled={loadingAI} className="ml-4 p-3 bg-indigo-600 rounded-full hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors">
                            <SendIcon />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}


// --- VISTA DEL PANEL DE ADMINISTRACIÓN --- (Componente Dashboard, sin cambios funcionales mayores)
function Dashboard({ user }) {
    const [file, setFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [filesList, setFilesList] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
  
    useEffect(() => {
        setLoading(true);
        const q = query(collection(db, "files"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const filesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFilesList(filesData);
            setLoading(false);
        });
        return unsubscribe;
    }, [user.uid]);
    
    // ... (resto de funciones de Dashboard: handleFileChange, handleUpload, handleDelete, handleEdit)
    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
          if (selectedFile.type !== "application/pdf") {
            setError("Error: Solo se permiten archivos PDF.");
            return;
          }
          if (selectedFile.size > 5 * 1024 * 1024) { // 5MB
            setError("Error: El archivo no debe exceder los 5MB.");
            return;
          }
          setFile(selectedFile);
          setError('');
        }
      };
    
      const handleUpload = () => {
        if (!file) return;
        const storageRef = ref(storage, `uploads/${user.uid}/${Date.now()}-${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
    
        uploadTask.on('state_changed',
          (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
          (error) => {
            console.error("Error al subir:", error);
            setError("Ocurrió un error durante la subida.");
          },
          () => {
            getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
              await addDoc(collection(db, "files"), {
                userId: user.uid,
                name: file.name,
                url: downloadURL,
                storagePath: storageRef.fullPath,
                createdAt: serverTimestamp(),
                status: 'processing'
              });
              setFile(null);
              setUploadProgress(0);
            });
          }
        );
      };
      
      const handleDelete = async (fileToDelete) => {
        if (!window.confirm(`¿Estás seguro de que quieres eliminar "${fileToDelete.name}"?`)) return;
        try {
          await deleteObject(ref(storage, fileToDelete.storagePath));
          await deleteDoc(doc(db, "files", fileToDelete.id));
        } catch (err) {
          console.error("Error al eliminar:", err);
          setError("No se pudo eliminar el archivo.");
        }
      };
    
      const handleEdit = async (fileToEdit) => {
        const newName = prompt("Introduce el nuevo nombre:", fileToEdit.name);
        if (newName && newName.trim() !== '' && newName !== fileToEdit.name) {
          try {
            await updateDoc(doc(db, "files", fileToEdit.id), { name: newName });
          } catch (err) {
            console.error("Error al actualizar:", err);
            setError("No se pudo renombrar el archivo.");
          }
        }
      };

    const FileStatus = ({ status }) => {
        switch (status) {
          case 'processing': return <div className="flex items-center text-sm text-yellow-400"><ClockIcon /><span className="ml-2">Procesando...</span></div>;
          case 'processed': return <div className="flex items-center text-sm text-green-400"><CheckCircleIcon /><span className="ml-2">Listo</span></div>;
          case 'error': return <div className="flex items-center text-sm text-red-400"><span>Error</span></div>;
          default: return null;
        }
      };

    return (
        <div className="flex-grow p-8 overflow-y-auto">
            <h2 className="text-3xl font-bold mb-8">Panel de Administración</h2>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl mb-8">
                <h3 className="text-xl font-semibold mb-4">Subir Nueva Ley (PDF)</h3>
                <div className="flex items-center space-x-4">
                    <input type="file" onChange={handleFileChange} accept="application/pdf" className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                    <button onClick={handleUpload} disabled={!file || uploadProgress > 0} className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md font-semibold transition-colors duration-300 disabled:bg-indigo-400 disabled:cursor-not-allowed whitespace-nowrap">
                        <UploadIcon/> Subir Archivo
                    </button>
                </div>
                {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
                {uploadProgress > 0 && (
                    <div className="w-full bg-gray-700 rounded-full mt-4"><div className="bg-green-500 text-xs font-medium text-blue-100 text-center p-0.5 leading-none rounded-full" style={{ width: `${uploadProgress}%` }}>{Math.round(uploadProgress)}%</div></div>
                )}
            </div>
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
                <h3 className="text-xl font-semibold mb-4">Base de Conocimiento</h3>
                <div className="space-y-3">
                    {loading ? <p>Cargando archivos...</p> : filesList.length === 0 ? <p className="text-gray-400">No has subido ningún archivo todavía.</p> :
                    filesList.map(f => (
                        <div key={f.id} className="flex items-center justify-between bg-gray-700 p-3 rounded-md hover:bg-gray-600 transition-colors">
                            <div className="flex items-center overflow-hidden mr-4"><FilePdfIcon/><span className="ml-4 truncate" title={f.name}>{f.name}</span></div>
                            <div className="flex items-center space-x-4 flex-shrink-0">
                                <FileStatus status={f.status} />
                                <button onClick={() => handleEdit(f)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-500 rounded-full"><EditIcon/></button>
                                <button onClick={() => handleDelete(f)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-500 rounded-full"><DeleteIcon/></button>
                            </div>
                        </div>
                    ))
                    }
                </div>
            </div>
        </div>
    );
}


// --- COMPONENTE CONTENEDOR PRINCIPAL ---
function MainApp({ user }) {
    const [currentView, setCurrentView] = useState('chat'); // 'dashboard' o 'chat'

    const handleLogout = async () => {
        try { await signOut(auth); } catch (error) { console.error("Error al cerrar sesión:", error); }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans flex">
            {/* Barra lateral de Navegación */}
            <div className="w-72 bg-gray-800 p-4 flex flex-col flex-shrink-0 border-r border-gray-700">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-8 text-center">Saturn AI</h1>
                    <nav className="space-y-2">
                        <button onClick={() => setCurrentView('dashboard')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md font-semibold transition-colors ${currentView === 'dashboard' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-700'}`}>
                            <DashboardIcon /> <span>Panel de Control</span>
                        </button>
                        <button onClick={() => setCurrentView('chat')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md font-semibold transition-colors ${currentView === 'chat' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-700'}`}>
                            <ChatIcon /> <span>Chat</span>
                        </button>
                    </nav>
                </div>
                <div className="mt-auto">
                   <p className="text-sm text-gray-400 mb-2">Sesión iniciada como:</p>
                   <p className="font-medium text-indigo-400 truncate" title={user.email}>{user.email}</p>
                   <button onClick={handleLogout} className="w-full mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-sm font-semibold transition-colors">
                     Cerrar Sesión
                   </button>
                </div>
            </div>
            
            {/* Contenido Principal (Dashboard o Chat) */}
            <main className="flex-grow flex flex-col">
              {currentView === 'dashboard' ? <Dashboard user={user} /> : <ChatView user={user} />}
            </main>
        </div>
    );
}
// --- COMPONENTE DE AUTENTICACIÓN --- (con cambios)
function AuthComponent() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
//---------Aqui agregamos el name, el apellido y la verificacion
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleAuth = async (e) => {
      e.preventDefault();
      setError(''); 
      setLoading(true);
      try {
        if (!isLogin) {
          if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden.");
            setLoading(false);
            return;
          }
        }

        if (isLogin) {
          await signInWithEmailAndPassword(auth, email, password);
        } else {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          await addDoc(collection(db, "users"), {
            userId: userCredential.user.uid,
            firstName: firstName,
            lastName: lastName,
            email: email,
            createdAt: serverTimestamp()
          });
        }
      } catch (err) {
        setError(err.message.includes("auth/invalid-credential") ? "Correo o contraseña incorrectos." : "Ha ocurrido un error.");
        console.error(err);
      }
      setLoading(false);
    };

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center font-sans">
        <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-2xl shadow-2xl">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white">Saturn AI</h1>
            <p className="text-gray-400 mt-2">{isLogin ? "Inicia sesión para continuar" : "Crea una cuenta para empezar"}</p>
          </div>
          <form className="space-y-6" onSubmit={handleAuth}>
            { !isLogin && (
              <>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} 
                       className="w-full p-3 text-white bg-gray-700 rounded-md border border-gray-600 transition" 
                       placeholder="Nombre" required/>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} 
                       className="w-full p-3 text-white bg-gray-700 rounded-md border border-gray-600 transition" 
                       placeholder="Apellido" required/>
              </>
            )}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} 
                   className="w-full p-3 text-white bg-gray-700 rounded-md border border-gray-600 transition" 
                   placeholder="tu@correo.com" required/>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} 
                   className="w-full p-3 text-white bg-gray-700 rounded-md border border-gray-600 transition" 
                   placeholder="••••••••" required/>
            { !isLogin && (
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} 
                     className="w-full p-3 text-white bg-gray-700 rounded-md border border-gray-600 transition" 
                     placeholder="Confirmar contraseña" required/>
            )}
            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full p-3 text-white bg-indigo-600 rounded-md font-semibold hover:bg-indigo-700 transition disabled:bg-indigo-400">
              {loading ? (isLogin ? "Iniciando..." : "Registrando...") : (isLogin ? "Iniciar Sesión" : "Registrar")}
            </button>
          </form>
          <p className="text-sm text-center text-gray-400">
            {isLogin ? "¿No tienes una cuenta? " : "¿Ya tienes una cuenta? "}
            <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="font-medium text-indigo-400 hover:text-indigo-500">
              {isLogin ? "Regístrate" : "Inicia Sesión"}
            </button>
          </p>
        </div>
      </div>
    );
}
// --- COMPONENTE RAÍZ DE LA APP ---
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-ce  nter justify-center">
        <h1 className="text-4xl font-bold text-white animate-pulse">Cargando Saturn AI...</h1>
      </div>
    );
  }

  return currentUser ? <MainApp user={currentUser} /> : <AuthComponent />;
}

export default App;
