import express from 'express';
import axios from 'axios';
import cors from 'cors';
import bcrypt from 'bcrypt'; // Importar bcrypt para hashing de senhas

// Importações do Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';

const app = express();

// Middleware para habilitar CORS para todas as requisições
app.use(cors());
app.use(express.json());

// --- SUAS CREDENCIAIS AIRTABLE E GEMINI (DO FICHEIRO .env NO GLITCH) ---
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Inicializa o Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Log para verificar se as chaves foram carregadas
console.log("Backend Init: AIRTABLE_BASE_ID carregado:", AIRTABLE_BASE_ID ? "Sim" : "Não");
console.log("Backend Init: AIRTABLE_API_KEY carregado:", AIRTABLE_API_KEY ? "Sim" : "Não");
console.log("Backend Init: GEMINI_API_KEY carregado:", GEMINI_API_KEY ? "Sim" : "Não");
console.log("Backend Init: FIREBASE_PROJECT_ID carregado:", firebaseConfig.projectId ? "Sim" : "Não"); // DEBUG FIREBASE

// --- Rota de Teste (GET /) ---
app.get('/', (req, res) => {
  console.log("Backend: Recebida requisição GET para / (rota de teste)");
  res.status(200).json({ status: 'Server is running', message: 'Hello from BioStart Backend!' });
});

// --- Função auxiliar para cabeçalhos Airtable ---
const getAirtableHeaders = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
});

// --- ROTAS DE AUTENTICAÇÃO (MIGRADO PARA FIRESTORE) ---

// Rota de Registro de Utilizador (Firestore)
app.post("/auth/register-firestore", async (req, res) => {
  const { name, email, password, age, regionCity, profession, renewableEnergyExperience, acceptTerms } = req.body;

  if (!name || !email || !password || !age || !regionCity) {
    return res.status(400).json({ success: false, error: "Por favor, preencha todos os campos obrigatórios." });
  }

  try {
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('Email', '==', email));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      return res.status(409).json({ success: false, error: "Este email já está registado." });
    }

    const hashedPassword = await bcrypt.hash(password, 10); // Hash da senha
    const newUserRef = await addDoc(usersCol, {
      "Nome Completo": name,
      Email: email,
      "Senha (Hash)": hashedPassword, // Salva a senha com hash
      Idade: parseInt(age),
      "Região/Cidade": regionCity,
      "Profissão/Ocupação": profession,
      "Experiência Energia Renovável": renewableEnergyExperience,
      "Aceita Termos": acceptTerms,
      CompletedContentIDs: "[]", // Inicializa como string JSON vazia
      checklistStateJSON: "{}", // Inicializa como string JSON vazia
      checklistProgress: 0,
      "Data de Registo": new Date().toISOString(), // Adiciona data de registro
      "Progresso Aprendizagem": 0,
      "Pontuação Quiz": 0,
      "Quiz Attempted": false,
      Status: "Ativo"
    });

    res.status(200).json({ success: true, recordId: newUserRef.id });
  } catch (error) {
    console.error("Backend: Erro no registo de utilizador (Firestore):", error);
    res.status(500).json({ success: false, error: "Erro ao registar utilizador.", details: error.message });
  }
});

// Rota de Login de Utilizador (Firestore)
app.post("/auth/login-firestore", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Por favor, insira o email e a senha." });
  }

  try {
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('Email', '==', email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return res.status(401).json({ success: false, error: "Email ou senha incorretos." });
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();
    const storedHashedPassword = userData["Senha (Hash)"];

    const passwordMatch = await bcrypt.compare(password, storedHashedPassword);

    if (passwordMatch) {
      res.status(200).json({ success: true, user: userData, recordId: userDoc.id });
    } else {
      res.status(401).json({ success: false, error: "Email ou senha incorretos." });
    }
  } catch (error) {
    console.error("Backend: Erro no login de utilizador (Firestore):", error);
    res.status(500).json({ success: false, error: "Erro ao fazer login.", details: error.message });
  }
});

// --- Rotas Antigas de Airtable (Removidas ou Desativadas para Usuários) ---
// As rotas /registro e /login antigas foram substituídas por /auth/register-firestore e /auth/login-firestore
// Se você ainda precisar delas para admins ou outras finalidades, pode adaptá-las.
app.post("/registro", (req, res) => res.status(405).json({ success: false, error: "Use /auth/register-firestore" }));
app.post("/login", (req, res) => res.status(405).json({ success: false, error: "Use /auth/login-firestore" }));

// Rotas de Admin (Ainda com Airtable, se necessário migrar depois)
app.post("/admin-registro", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).send({ error: "Nome, email e senha são obrigatórios." });
    }
    try {
        const existingAdmins = await axios.get(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Administradores?filterByFormula={Email}='${email}'&maxRecords=1`,
            { headers: getAirtableHeaders() }
        );
        if (existingAdmins.data.records.length > 0) {
            return res.status(409).send({ error: "Este email de administrador já está registado." });
        }
        const response = await axios.post(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Administradores`,
            { fields: { "Nome do Admin": name, "Email": email, "Senha (Hash)": password } },
            { headers: getAirtableHeaders() }
        );
        res.status(200).send({ success: true, recordId: response.data.id });
    } catch (err) {
        console.error("Backend: Erro no registo de administrador:", err.response?.data || err.message);
        res.status(500).send({ error: "Erro ao registar administrador", details: err.response?.data || err.message });
    }
});

app.post("/admin-login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).send({ error: "Email e senha são obrigatórios." });
    try {
        const response = await axios.get(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Administradores?filterByFormula=AND({Email}='${email}',{Senha (Hash)}='${password}')&maxRecords=1`,
        { headers: getAirtableHeaders() }
        );
        if (response.data.records.length > 0) {
        const adminRecord = response.data.records[0];
        res.status(200).send({ success: true, isAdmin: true, admin: adminRecord.fields, recordId: adminRecord.id });
        } else {
        res.status(401).send({ error: "Credenciais de administrador incorretas." });
        }
    } catch (err) {
        res.status(500).send({ error: "Erro no login de administrador.", details: err.response?.data || err.message });
    }
});

// --- ROTAS DE CONTEÚDO (COM FIRESTORE) ---
const getFirestoreCollectionName = (tableName) => {
  switch (tableName) {
    case 'Conteudo Educativo': return 'educational_texts';
    case 'Quizzes': return 'quizzes';
    case 'Checklists': return 'checklists';
    default: return tableName.toLowerCase().replace(/\s/g, '_');
  }
};

const getFirestoreContent = async (res, tableName, fieldMapping) => {
  try {
    const collectionRef = collection(db, getFirestoreCollectionName(tableName));
    console.log(`DEBUG GET FIRESTORE: Chamando Firestore para coleção: ${getFirestoreCollectionName(tableName)}`);
    const snapshot = await getDocs(collectionRef);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const mappedData = data.map(item => {
        const mappedItem = fieldMapping({ id: item.id, fields: item });
        if (tableName === 'Quizzes' && item.Perguntas) {
            mappedItem.questions = JSON.parse(item.Perguntas);
        }
        if (tableName === 'Checklists' && item.items) {
            mappedItem.items = JSON.parse(item.items);
        }
        return mappedItem;
    });

    res.status(200).json({ success: true, data: mappedData });
  } catch (error) {
    console.error(`Erro ao obter dados de ${tableName} (Firestore):`, error);
    res.status(500).json({ success: false, error: `Erro ao obter dados de ${tableName} (Firestore).` });
  }
};

const postToFirestore = async (res, tableName, fieldsToPost) => {
  try {
    const collectionRef = collection(db, getFirestoreCollectionName(tableName));
    console.log(`DEBUG POST FIRESTORE: Adicionando documento à coleção: ${getFirestoreCollectionName(tableName)}`);

    const dataToSave = { ...fieldsToPost };
    if (tableName === 'Quizzes' && dataToSave.questions) {
        dataToSave.Perguntas = JSON.stringify(dataToSave.questions);
        delete dataToSave.questions;
    }
    if (tableName === 'Checklists' && dataToSave.items) {
        dataToSave.items = JSON.stringify(dataToSave.items);
        delete dataToSave.items;
    }
    
    const docRef = await addDoc(collectionRef, dataToSave);
    res.status(200).send({ success: true, recordId: docRef.id });
  } catch (error) {
    console.error(`Erro ao criar em ${tableName} (Firestore):`, error);
    res.status(500).send({ error: `Erro ao criar em ${tableName} (Firestore).`, details: error.message });
  }
};

const patchFirestoreContent = async (res, tableName, id, fieldsToUpdate) => {
  if (Object.keys(fieldsToUpdate).length === 0) {
    return res.status(400).send({ error: "Nenhum campo para atualizar." });
  }
  try {
    const docRef = doc(db, getFirestoreCollectionName(tableName), id);
    console.log(`DEBUG PATCH FIRESTORE: Atualizando documento ${id} na coleção: ${getFirestoreCollectionName(tableName)}`);

    const dataToUpdate = { ...fieldsToUpdate };
    if (tableName === 'Quizzes' && dataToUpdate.questions) {
        dataToUpdate.Perguntas = JSON.stringify(dataToUpdate.questions);
        delete dataToUpdate.questions;
    }
    if (tableName === 'Checklists' && dataToUpdate.items) {
        dataToUpdate.items = JSON.stringify(dataToUpdate.items);
        delete dataToUpdate.items;
    }

    await updateDoc(docRef, dataToUpdate);
    res.status(200).send({ success: true, data: dataToUpdate });
  } catch (error) {
    console.error(`Erro ao atualizar em ${tableName} (Firestore):`, error);
    res.status(500).send({ error: `Erro ao atualizar em ${tableName} (Firestore).`, details: error.message });
  }
};

const deleteFirestoreRecord = async (tableName, id, res) => {
  try {
    const docRef = doc(db, getFirestoreCollectionName(tableName), id);
    console.log(`DEBUG DELETE FIRESTORE: Deletando documento ${id} da coleção: ${getFirestoreCollectionName(tableName)}`);
    await deleteDoc(docRef);
    res.status(200).send({ success: true });
  } catch (error) {
    console.error(`Erro ao excluir em ${tableName} (Firestore):`, error);
    res.status(500).send({ error: "Erro ao excluir (Firestore)." });
  }
};


app.get("/content/educational-texts", (req, res) => getFirestoreContent(res, 'Conteudo Educativo', record => ({
  id: record.id,
  title: record.fields.titulo,
  content: record.fields.conteudo,
  text: record.fields.conteudo,
  annexUrl: record.fields.imageUrl || null,
  image: record.fields.imageUrl || null,
})));

app.get("/content/quizzes", (req, res) => getFirestoreContent(res, 'Quizzes', record => {
    let questions = [];
    try {
        if (record.fields.Perguntas) { // No Firestore, 'Perguntas' será uma string JSON
            const parsedQuestions = JSON.parse(record.fields.Perguntas);
            if (Array.isArray(parsedQuestions)) {
                questions = parsedQuestions.filter(q => q && typeof q.question === 'string' && q.question.trim() !== '' && Array.isArray(q.options) && q.options.length > 0 && q.options.every(opt => typeof opt === 'string' && opt.trim() !== ''));
            }
        }
    } catch (e) { console.error("Erro JSON no quiz (Firestore):", record.id, e); }
    return { id: record.id, title: record.fields.Title, questions };
}));

app.get("/content/checklists", (req, res) => getFirestoreContent(res, 'Checklists', record => {
    let items = [];
    try {
        if (record.fields.items) { // No Firestore, 'items' será uma string JSON
            const parsedItems = JSON.parse(record.fields.items);
            if (Array.isArray(parsedItems)) {
                items = parsedItems.map(item => ({ text: item.text, completed: item.completed || false })); // Adapta para o formato esperado
            }
        }
    } catch (e) { console.error("Erro JSON no checklist (Firestore):", record.id, e); }
    return { id: record.id, title: record.fields.titulo, items };
}));

app.post("/content/educational-texts", (req, res) => {
  const { title, content, annexUrl } = req.body;
  if (!title || !content) {
    return res.status(400).send({ error: "Campos obrigatórios em falta." });
  }
  const fields = { titulo: title, conteudo: content };
  if (annexUrl) fields.imageUrl = annexUrl;
  postToFirestore(res, 'Conteudo Educativo', fields);
});

app.post("/content/quizzes", (req, res) => {
  const { title, questions } = req.body;
  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).send({ error: "Título e pelo menos uma pergunta são obrigatórios." });
  }
  const fields = { 'Title': title, 'questions': questions }; // 'questions' será stringified em postToFirestore
  postToFirestore(res, 'Quizzes', fields);
});

app.post("/content/checklists", (req, res) => {
  const { title, items } = req.body;
  if (!title || !items || !Array.isArray(items)) {
      return res.status(400).send({ error: "Título e itens são obrigatórios." });
  }
  const fields = { 'titulo': title, 'items': items }; // 'items' será stringified em postToFirestore
  postToFirestore(res, 'Checklists', fields);
});

app.patch("/content/educational-texts/:id", (req, res) => {
  const { title, content, annexUrl } = req.body;
  const fields = {};
  if (title) fields.titulo = title;
  if (content) fields.conteudo = content;
  if (annexUrl !== undefined) fields.imageUrl = annexUrl;
  patchFirestoreContent(res, 'Conteudo Educativo', req.params.id, fields);
});

app.patch("/content/quizzes/:id", (req, res) => {
  const { title, questions } = req.body;
  const fields = {};
  if (title) fields.Title = title;
  if (questions && Array.isArray(questions)) {
    fields.questions = questions; // 'questions' será stringified em patchFirestoreContent
  }
  patchFirestoreContent(res, 'Quizzes', req.params.id, fields);
});

app.patch("/content/checklists/:id", (req, res) => {
  const { title, items } = req.body;
  const fields = {};
  if (title) fields.titulo = title;
  if (items && Array.isArray(items)) {
    fields.items = items; // 'items' será stringified em patchFirestoreContent
  }
  patchFirestoreContent(res, 'Checklists', req.params.id, fields);
});

app.delete("/content/quizzes/:id", (req, res) => deleteFirestoreRecord('Quizzes', req.params.id, res));
app.delete("/content/educational-texts/:id", (req, res) => deleteFirestoreRecord('Conteudo Educativo', req.params.id, res));
app.delete("/content/checklists/:id", (req, res) => deleteFirestoreRecord('Checklists', req.params.id, res));

// --- ROTAS DO CHECKLIST DO UTILIZADOR E FÓRUM (MIGRADO PARA FIRESTORE) ---
// Rota para obter estado do checklist do utilizador (Firestore)
app.get("/user/:userId/checklist", async (req, res) => {
    const { userId } = req.params;
    try {
        const userDocRef = doc(db, 'users', userId);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            return res.status(404).json({ success: false, error: "Utilizador não encontrado." });
        }

        const checklistState = userDocSnap.data().checklistStateJSON || '{}';
        res.status(200).json({ success: true, checklistState: JSON.parse(checklistState) });
    } catch (error) {
        console.error("Erro ao obter estado do checklist (Firestore):", error);
        res.status(500).json({ success: false, error: "Erro ao obter dados do checklist.", details: error.message });
    }
});

// Rota para guardar estado do checklist do utilizador (Firestore)
app.post("/user/:userId/checklist", async (req, res) => {
    const { userId } = req.params;
    const { checklistState, progress } = req.body;
    try {
        const userDocRef = doc(db, 'users', userId);
        await updateDoc(userDocRef, {
            checklistStateJSON: JSON.stringify(checklistState),
            checklistProgress: progress
        });
        res.status(200).json({ success: true, message: "Progresso do checklist guardado (Firestore)." });
    }
    catch (error) {
        console.error("Erro ao guardar estado do checklist (Firestore):", error);
        res.status(500).json({ success: false, error: "Erro ao guardar progresso do checklist.", details: error.message });
    }
});

// Rota para postar pergunta no fórum (Firestore)
app.post("/forum/post-question", async (req, res) => {
    const { question, author } = req.body;
    if (!question || !author) {
        return res.status(400).json({ success: false, error: "Questão e autor são obrigatórios." });
    }
    try {
        const forumColRef = collection(db, 'forum_posts');
        const docRef = await addDoc(forumColRef, {
            question,
            author,
            createdAt: new Date().toISOString() // Adiciona timestamp
        });
        res.status(200).json({ success: true, recordId: docRef.id });
    } catch (error) {
        console.error("Erro ao postar pergunta no fórum (Firestore):", error);
        res.status(500).json({ success: false, error: "Erro ao postar pergunta no fórum.", details: error.message });
    }
});

// Rota para obter tópicos do fórum (Firestore)
app.get("/forum/topics", async (req, res) => {
    try {
        const forumColRef = collection(db, 'forum_posts');
        const querySnapshot = await getDocs(forumColRef);
        const topics = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        res.status(200).json({ success: true, data: topics });
    } catch (error) {
        console.error("Erro ao obter tópicos do fórum (Firestore):", error);
        res.status(500).json({ success: false, error: "Erro ao obter tópicos do fórum.", details: error.message });
    }
});

// Rota para salvar pontuação do quiz (Firestore)
app.post("/user/quiz-score", async (req, res) => {
    const { userId, score, totalQuestions } = req.body;
    if (!userId || score === undefined || totalQuestions === undefined) {
        return res.status(400).json({ success: false, error: "Dados do quiz incompletos." });
    }
    try {
        const userDocRef = doc(db, 'users', userId);
        await updateDoc(userDocRef, {
            "Pontuação Quiz": score,
            "Quiz Attempted": true // Marca que o quiz foi tentado
        });
        res.status(200).json({ success: true, message: "Pontuação do quiz salva (Firestore)." });
    } catch (error) {
        console.error("Erro ao salvar pontuação do quiz (Firestore):", error);
        res.status(500).json({ success: false, error: "Erro ao salvar pontuação do quiz.", details: error.message });
    }
});


// --- ROTAS DE IA ---
const callGeminiAPI = async (prompt) => {
    if (!GEMINI_API_KEY) {
        throw new Error("A chave da API do Gemini não está configurada no servidor.");
    }
    console.log("DEBUG GEMINI: GEMINI_API_KEY:", GEMINI_API_KEY ? "Presente" : "Ausente"); // DEBUG
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    console.log("DEBUG GEMINI: Gemini API URL:", API_URL); // DEBUG
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    console.log("DEBUG GEMINI: Payload:", payload); // DEBUG

    const response = await axios.post(API_URL, payload, { headers: { 'Content-Type': 'application/json' } });
    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.data.candidates[0].content.parts[0].text;
    } else {
        throw new Error("Resposta inválida da API do Gemini.");
    }
};
app.post("/generate-content-ai", async (req, res) => {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ success: false, error: "O tópico é obrigatório." });
    try {
        const prompt = `Aja como um especialista em biogás e energias renováveis. Crie um texto educativo detalhado, claro e bem estruturado sobre o seguinte tópico: "${topic}". O texto deve ser adequado para um público leigo mas interessado, como pequenos agricultores ou estudantes. Organize o conteúdo com títulos e parágrafos curtos.`;
        const generatedText = await callGeminiAPI(prompt);
        res.status(200).json({ success: true, generatedText });
    } catch (error) {
        console.error("Erro ao gerar conteúdo com IA:", error.response?.data || error.message);
        console.error("DEBUG GENERATE CONTENT AI: Erro DETALHADO:", error); // DEBUG
        console.error("DEBUG GENERATE CONTENT AI: Dados da resposta do erro (se houver):", error.response?.data); // DEBUG
        res.status(500).json({ success: false, error: "Falha ao comunicar com a API de IA." });
    }
});

app.post("/generate-quiz-questions-ai", async (req, res) => {
    const { topic } = req.body;
    if (!topic) {
        return res.status(400).json({ success: false, error: "O tópico é obrigatório." });
    }

    try {
        const prompt = `Crie 5 perguntas de múltipla escolha sobre o tópico de biogás: "${topic}". Formate a resposta EXATAMENTE como um array de objetos JSON, sem nenhum texto ou formatação adicional antes ou depois. Cada objeto deve ter as chaves "question" (string), "options" (um array de 4 strings) e "correct" (o índice da resposta correta, de 0 a 3). Exemplo: [{"question": "...", "options": ["a", "b", "c", "d"], "correct": 0}]`;
        const generatedQuestions = await callGeminiAPI(prompt);
        res.status(200).json({ success: true, generatedQuestions });
    } catch (error) {
        console.error("Erro ao gerar perguntas de quiz com IA:", error.response?.data || error.message);
        console.error("DEBUG GENERATE QUIZ AI: Erro DETALHADO:", error); // DEBUG
        console.error("DEBUG GENERATE QUIZ AI: Dados da resposta do erro (se houver):", error.response?.data); // DEBUG
        res.status(500).json({ success: false, error: "Falha ao comunicar com a API de IA." });
    }
});

// A porta é definida pelo Glitch, mas 3001 é um fallback
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
