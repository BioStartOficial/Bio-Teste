import express from 'express';
import axios from 'axios';
import cors from 'cors';

// Importações do Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const app = express();

// Middleware para habilitar CORS para todas as requisições
app.use(cors());
app.use(express.json());

// --- SUAS CREDENCIAIS AIRTABLE E GEMINI (DO FICHEIRO .env NO GLITCH) ---
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- CONFIGURAÇÃO DO FIREBASE (PARA CONTEÚDO) ---
// Substitua com suas credenciais do Firebase. Você precisará criar um projeto no Firebase.
// Vá em Projeto -> Configurações do Projeto -> Seus Apps -> Web (</>) -> Configuração
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY, // Você precisará adicionar esta variável no Render
  authDomain: process.env.FIREBASE_AUTH_DOMAIN, // Você precisará adicionar esta variável no Render
  projectId: process.env.FIREBASE_PROJECT_ID, // Você precisará adicionar esta variável no Render
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // Você precisará adicionar esta variável no Render
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID, // Você precisará adicionar esta variável no Render
  appId: process.env.FIREBASE_APP_ID // Você precisará adicionar esta variável no Render
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

// --- ROTAS DE AUTENTICAÇÃO (Utilizador e Admin) - AINDA COM AIRTABLE ---
app.post("/registro", async (req, res) => {
  const { name, email, password, age, regionCity, profession, renewableEnergyExperience, acceptTerms } = req.body;
  if (!name || !email || !password || !age || !regionCity) {
    return res.status(400).send({ error: "Por favor, preencha todos os campos obrigatórios." });
  }
  try {
    console.log("DEBUG REGISTRO: AIRTABLE_API_KEY:", AIRTABLE_API_KEY ? "Presente" : "Ausente"); // DEBUG
    console.log("DEBUG REGISTRO: AIRTABLE_BASE_ID:", AIRTABLE_BASE_ID); // DEBUG
    const existingUsers = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Utilizadores?filterByFormula={Email}='${email}'&maxRecords=1`,
      { headers: getAirtableHeaders() } // Usando a função auxiliar
    );
    if (existingUsers.data.records.length > 0) {
      return res.status(409).send({ error: "Este email já está registado." });
    }
    const response = await axios.post(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Utilizadores`,
      { fields: { "Nome Completo": name, Email: email, "Senha (Hash)": password, Idade: parseInt(age), "Região/Cidade": regionCity, "Profissão/Ocupação": profession, "Experiência Energia Renovável": renewableEnergyExperience, "Aceita Termos": acceptTerms, CompletedContentIDs: "[]" } },
      { headers: getAirtableHeaders() } // Usando a função auxiliar
    );
    res.status(200).send({ success: true, recordId: response.data.id });
  } catch (err) {
    console.error("Backend: Erro no registo de utilizador:", err.response?.data || err.message);
    res.status(500).send({ error: "Erro ao registar utilizador", details: err.response?.data || err.message });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send({ error: "Por favor, insira o email e a senha." });
  }
  try {
    console.log("Tentando login para email:", email);
    const airtableLoginUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Utilizadores?filterByFormula=AND({Email}='${email}',{Senha (Hash)}='${password}')&maxRecords=1`;
    console.log("DEBUG LOGIN: Chamando Airtable URL:", airtableLoginUrl); // DEBUG
    console.log("DEBUG LOGIN: Com Headers:", getAirtableHeaders()); // DEBUG

    const response = await axios.get(
      airtableLoginUrl,
      { headers: getAirtableHeaders() } // Usando a função auxiliar
    );

    console.log("Resposta do Airtable (status) para login:", response.status);
    console.log("Resposta do Airtable (data) para login:", response.data);

    if (response.data.records.length > 0) {
      const userRecord = response.data.records[0];
      const completedIds = JSON.parse(userRecord.fields.CompletedContentIDs || '[]');
      res.status(200).send({ success: true, user: userRecord.fields, recordId: userRecord.id, completedContentIds: completedIds });
    } else {
      res.status(401).send({ error: "Email ou senha incorretos." });
    }
  } catch (err) {
    console.error("Backend: Erro DETALHADO no login de utilizador:", err);
    console.error("Mensagem do erro:", err.message);
    console.error("Dados da resposta do erro (se houver):", err.response?.data);
    res.status(500).send({ error: "Erro ao fazer login", details: err.response?.data || err.message });
  }
});

app.post("/admin-registro", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).send({ error: "Nome, email e senha são obrigatórios." });
    }
    try {
        console.log("DEBUG ADMIN REGISTRO: AIRTABLE_API_KEY:", AIRTABLE_API_KEY ? "Presente" : "Ausente"); // DEBUG
        console.log("DEBUG ADMIN REGISTRO: AIRTABLE_BASE_ID:", AIRTABLE_BASE_ID); // DEBUG
        const existingAdmins = await axios.get(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Administradores?filterByFormula={Email}='${email}'&maxRecords=1`,
            { headers: getAirtableHeaders() } // Usando a função auxiliar
        );
        if (existingAdmins.data.records.length > 0) {
            return res.status(409).send({ error: "Este email de administrador já está registado." });
        }
        const response = await axios.post(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Administradores`,
            { fields: { "Nome do Admin": name, "Email": email, "Senha (Hash)": password } },
            { headers: getAirtableHeaders() } // Usando a função auxiliar
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
        console.log("DEBUG ADMIN LOGIN: AIRTABLE_API_KEY:", AIRTABLE_API_KEY ? "Presente" : "Ausente"); // DEBUG
        console.log("DEBUG ADMIN LOGIN: AIRTABLE_BASE_ID:", AIRTABLE_BASE_ID); // DEBUG
        const response = await axios.get(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Administradores?filterByFormula=AND({Email}='${email}',{Senha (Hash)}='${password}')&maxRecords=1`,
        { headers: getAirtableHeaders() } // Usando a função auxiliar
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

// --- ROTAS DE CONTEÚDO (AGORA COM FIRESTORE) ---
// Função auxiliar para mapear nomes de tabelas para coleções Firestore
const getFirestoreCollectionName = (tableName) => {
  switch (tableName) {
    case 'Conteudo Educativo': return 'educational_texts';
    case 'Quizzes': return 'quizzes';
    case 'Checklists': return 'checklists';
    // Adicione outros casos conforme necessário
    default: return tableName.toLowerCase().replace(/\s/g, '_'); // Converte para snake_case
  }
};

// Função para obter dados do Firestore
const getFirestoreContent = async (res, tableName, fieldMapping) => {
  try {
    const collectionRef = collection(db, getFirestoreCollectionName(tableName));
    console.log(`DEBUG GET FIRESTORE: Chamando Firestore para coleção: ${getFirestoreCollectionName(tableName)}`); // DEBUG
    const snapshot = await getDocs(collectionRef);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Mapeamento de campos para o formato esperado pelo frontend
    const mappedData = data.map(item => {
        const mappedItem = fieldMapping({ id: item.id, fields: item });
        // Ajustes específicos para Quizzes e Checklists ao ler do Firestore
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

// Função para adicionar dados ao Firestore
const postToFirestore = async (res, tableName, fieldsToPost) => {
  try {
    const collectionRef = collection(db, getFirestoreCollectionName(tableName));
    console.log(`DEBUG POST FIRESTORE: Adicionando documento à coleção: ${getFirestoreCollectionName(tableName)}`); // DEBUG

    // Ajustes específicos para Quizzes e Checklists ao salvar no Firestore
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

// Função para atualizar dados no Firestore
const patchFirestoreContent = async (res, tableName, id, fieldsToUpdate) => {
  if (Object.keys(fieldsToUpdate).length === 0) {
    return res.status(400).send({ error: "Nenhum campo para atualizar." });
  }
  try {
    const docRef = doc(db, getFirestoreCollectionName(tableName), id);
    console.log(`DEBUG PATCH FIRESTORE: Atualizando documento ${id} na coleção: ${getFirestoreCollectionName(tableName)}`); // DEBUG

    // Ajustes específicos para Quizzes e Checklists ao atualizar no Firestore
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

// Função para deletar dados no Firestore
const deleteFirestoreRecord = async (tableName, id, res) => {
  try {
    const docRef = doc(db, getFirestoreCollectionName(tableName), id);
    console.log(`DEBUG DELETE FIRESTORE: Deletando documento ${id} da coleção: ${getFirestoreCollectionName(tableName)}`); // DEBUG
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
            items = JSON.parse(record.fields.items);
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

// --- ROTAS DO CHECKLIST DO UTILIZADOR (AINDA COM AIRTABLE) ---
app.get("/user/:userId/checklist", async (req, res) => {
    const { userId } = req.params;
    try {
        console.log("DEBUG CHECKLIST GET: AIRTABLE_API_KEY:", AIRTABLE_API_KEY ? "Presente" : "Ausente"); // DEBUG
        console.log("DEBUG CHECKLIST GET: AIRTABLE_BASE_ID:", AIRTABLE_BASE_ID); // DEBUG
        const checklistGetUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Utilizadores/${userId}`;
        console.log("DEBUG CHECKLIST GET: Airtable URL:", checklistGetUrl); // DEBUG
        console.log("DEBUG CHECKLIST GET: Com Headers:", getAirtableHeaders()); // DEBUG

        const response = await axios.get(
            checklistGetUrl,
            { headers: getAirtableHeaders() } // Usando a função auxiliar
        );
        const checklistState = response.data.fields.checklistStateJSON || '{}';
        res.status(200).json({ success: true, checklistState: JSON.parse(checklistState) });
    } catch (error) {
        console.error("Erro ao obter estado do checklist:", error.response?.data || error.message);
        console.error("DEBUG CHECKLIST GET: Erro DETALHADO:", error); // DEBUG
        console.error("DEBUG CHECKLIST GET: Dados da resposta do erro (se houver):", error.response?.data); // DEBUG
        res.status(500).json({ success: false, error: "Erro ao obter dados do checklist." });
    }
});

app.post("/user/:userId/checklist", async (req, res) => {
    const { userId } = req.params;
    const { checklistState, progress } = req.body;
    try {
        console.log("DEBUG CHECKLIST POST: AIRTABLE_API_KEY:", AIRTABLE_API_KEY ? "Presente" : "Ausente"); // DEBUG
        console.log("DEBUG CHECKLIST POST: AIRTABLE_BASE_ID:", AIRTABLE_BASE_ID); // DEBUG
        const checklistPostUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Utilizadores/${userId}`;
        console.log("DEBUG CHECKLIST POST: Airtable URL:", checklistPostUrl); // DEBUG
        console.log("DEBUG CHECKLIST POST: Com Headers:", getAirtableHeaders()); // DEBUG
        console.log("DEBUG CHECKLIST POST: Body:", { "checklistStateJSON": JSON.stringify(checklistState), "checklistProgress": progress }); // DEBUG

        await axios.patch(
            checklistPostUrl,
            { fields: { "checklistStateJSON": JSON.stringify(checklistState), "checklistProgress": progress } },
            { headers: getAirtableHeaders() } // Usando a função auxiliar
        );
        res.status(200).json({ success: true, message: "Progresso do checklist guardado." });
    }
    catch (error) {
        console.error("Erro ao guardar estado do checklist:", error.response?.data || error.message);
        console.error("DEBUG CHECKLIST POST: Erro DETALHADO:", error); // DEBUG
        console.error("DEBUG CHECKLIST POST: Dados da resposta do erro (se houver):", error.response?.data); // DEBUG
        res.status(500).json({ success: false, error: "Erro ao guardar progresso do checklist." });
    }
});


// --- ROTAS DE IA ---
const callGeminiAPI = async (prompt) => {
    if (!GEMINI_API_KEY) {
        throw new Error("A chave da API do Gemini não está configurada no servidor.");
    }
    console.log("DEBUG GEMINI: GEMINI_API_KEY:", GEMINI_API_KEY ? "Presente" : "Ausente"); // DEBUG
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`; // Alterado para gemini-2.0-flash
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
