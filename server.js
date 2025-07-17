import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();

// Middleware para habilitar CORS para todas as requisições
app.use(cors());
app.use(express.json());

// --- SUAS CREDENCIAIS AIRTABLE E GEMINI (DO FICHEIRO .env NO GLITCH) ---
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Log para verificar se as chaves foram carregadas
console.log("Backend Init: AIRTABLE_BASE_ID carregado:", AIRTABLE_BASE_ID ? "Sim" : "Não");
console.log("Backend Init: AIRTABLE_API_KEY carregado:", AIRTABLE_API_KEY ? "Sim" : "Não");
console.log("Backend Init: GEMINI_API_KEY carregado:", GEMINI_API_KEY ? "Sim" : "Não");

// --- Rota de Teste (GET /) ---
app.get('/', (req, res) => {
  console.log("Backend: Recebida requisição GET para / (rota de teste)");
  res.status(200).json({ status: 'Server is running', message: 'Hello from BioStart Backend!' });
});

// --- Função auxiliar para cabeçalhos Airtable ---
// Esta função centraliza os cabeçalhos necessários para todas as requisições Airtable.
const getAirtableHeaders = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
});

// --- ROTAS DE AUTENTICAÇÃO (Utilizador e Admin) ---
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
    // Adicionado logs detalhados para depuração da chamada Airtable no login
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
    console.error("Backend: Erro DETALHADO no login de utilizador:", err); // Loga o objeto 'err' completo
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

// --- ROTAS DE CONTEÚDO (AGORA COM MOCK DATA) ---
// A função getContent foi modificada para retornar dados simulados
const getContent = async (res, tableName, fieldMapping) => {
  // Dados simulados para cada tipo de conteúdo
  const mockData = {
    'Conteudo Educativo': [
      { id: 'mock1', titulo: 'Biogás para Iniciantes', conteudo: 'O biogás é uma fonte de energia renovável produzida a partir da decomposição de matéria orgânica. É uma alternativa sustentável para a produção de energia em pequenas propriedades.', imageUrl: 'https://placehold.co/400x200/ADD8E6/000000?text=Biogas+Intro' },
      { id: 'mock2', titulo: 'Vantagens do Biodigestor', conteudo: 'Além de gerar energia, o biodigestor produz biofertilizante, reduz odores e diminui a poluição ambiental. Ideal para uso rural.', imageUrl: 'https://placehold.co/400x200/90EE90/000000?text=Biodigestor+Vantagens' },
      { id: 'mock3', titulo: 'Manutenção de Biodigestores', conteudo: 'A manutenção regular garante a eficiência do biodigestor. Verifique vazamentos, temperatura e pH do material.', imageUrl: 'https://placehold.co/400x200/FFD700/000000?text=Manutencao' },
    ],
    'Quizzes': [
      { id: 'mockQ1', Title: 'Quiz Básico de Biogás', Perguntas: JSON.stringify([
        { question: 'Qual o principal gás do biogás?', options: ['Oxigênio', 'Metano', 'Nitrogênio', 'Dióxido de Carbono'], correct: 1 },
        { question: 'De onde vem a matéria orgânica para o biogás?', options: ['Plástico', 'Metais', 'Resíduos animais e vegetais', 'Pedras'], correct: 2 }
      ])},
      { id: 'mockQ2', Title: 'Quiz Avançado de Biodigestores', Perguntas: JSON.stringify([
        { question: 'Qual o processo de produção do biogás?', options: ['Combustão', 'Fermentação aeróbica', 'Digestão anaeróbica', 'Fissão nuclear'], correct: 2 },
        { question: 'Qual subproduto do biodigestor pode ser usado na agricultura?', options: ['Gás natural', 'Biofertilizante', 'Ácido sulfúrico', 'Água potável'], correct: 1 }
      ])},
    ],
    'Checklists': [
      { id: 'mockC1', titulo: 'Checklist de Montagem Simples', items: JSON.stringify([
        'Coletar materiais', 'Escavar o fosso', 'Instalar o tanque', 'Conectar tubulações', 'Adicionar matéria orgânica'
      ])},
      { id: 'mockC2', titulo: 'Checklist de Segurança', items: JSON.stringify([
        'Verificar vazamentos de gás', 'Usar EPIs', 'Manter área ventilada', 'Não fumar próximo ao biodigestor'
      ])},
    ],
    'Simulations': [
        { id: 'mockS1', titulo: 'Simulação de Produção Padrão', description: 'Simulação de um sistema de 10m³ com esterco bovino.' },
        { id: 'mockS2', titulo: 'Simulação de Pequena Propriedade', description: 'Cálculo de biogás para uma fazenda com 50 animais.' },
    ]
  };

  try {
    // Retorna os dados simulados
    const data = mockData[tableName] || [];
    res.status(200).json({ success: true, data });
  } catch (error) {
    // Este catch é mais para erros inesperados na lógica do mock, não de API externa
    console.error(`Erro ao obter dados de ${tableName} (mock):`, error.message);
    res.status(500).json({ success: false, error: `Erro interno ao obter dados de ${tableName}.` });
  }
};

app.get("/content/educational-texts", (req, res) => getContent(res, 'Conteudo Educativo', record => ({
  id: record.id,
  title: record.fields.titulo,
  content: record.fields.conteudo,
  text: record.fields.conteudo,
  annexUrl: record.fields.imageUrl || null,
  image: record.fields.imageUrl || null,
})));

app.get("/content/quizzes", (req, res) => getContent(res, 'Quizzes', record => {
    let questions = [];
    try {
        if (record.fields.Perguntas) {
            const parsedQuestions = JSON.parse(record.fields.Perguntas);
            if (Array.isArray(parsedQuestions)) {
                questions = parsedQuestions.filter(q => q && typeof q.question === 'string' && q.question.trim() !== '' && Array.isArray(q.options) && q.options.length > 0 && q.options.every(opt => typeof opt === 'string' && opt.trim() !== ''));
            }
        }
    } catch (e) { console.error("Erro JSON no quiz (mock):", record.id); }
    return { id: record.id, title: record.fields.Title, questions };
}));

app.get("/content/checklists", (req, res) => getContent(res, 'Checklists', record => {
    let items = [];
    try {
        if (record.fields.items) {
            items = JSON.parse(record.fields.items);
        }
    } catch (e) { console.error("Erro JSON no checklist (mock):", record.id); }
    return { id: record.id, title: record.fields.titulo, items };
}));

// As rotas POST, PATCH, DELETE para conteúdo não serão funcionais com mock data
// Elas ainda estão aqui, mas não persistirão dados.
const postToAirtable = async (res, tableName, fieldsToPost) => {
  console.log(`AVISO: Tentativa de POST para ${tableName} com mock data. Dados não serão persistidos.`);
  res.status(200).send({ success: true, recordId: `mock_new_${Date.now()}` });
};

app.post("/content/educational-texts", (req, res) => {
  const { title, content, annexUrl } = req.body;
  if (!title || !content) {
    return res.status(400).send({ error: "Campos obrigatórios em falta." });
  }
  const fields = { titulo: title, conteudo: content };
  if (annexUrl) fields.imageUrl = annexUrl;
  postToAirtable(res, 'Conteudo Educativo', fields);
});

app.post("/content/quizzes", (req, res) => {
  const { title, questions } = req.body;
  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).send({ error: "Título e pelo menos uma pergunta são obrigatórios." });
  }
  const fields = { 'Title': title, 'Perguntas': JSON.stringify(questions) };
  postToAirtable(res, 'Quizzes', fields);
});

app.post("/content/checklists", (req, res) => {
  const { title, items } = req.body;
  if (!title || !items || !Array.isArray(items)) {
      return res.status(400).send({ error: "Título e itens são obrigatórios." });
  }
  const fields = { 'titulo': title, 'items': JSON.stringify(items) };
  postToAirtable(res, 'Checklists', fields);
});

const patchContent = async (res, tableName, id, fieldsToUpdate) => {
  console.log(`AVISO: Tentativa de PATCH para ${tableName}/${id} com mock data. Dados não serão persistidos.`);
  res.status(200).send({ success: true, data: fieldsToUpdate });
};

app.patch("/content/educational-texts/:id", (req, res) => {
  const { title, content, annexUrl } = req.body;
  const fields = {};
  if (title) fields.titulo = title;
  if (content) fields.conteudo = content;
  if (annexUrl !== undefined) fields.imageUrl = annexUrl;
  patchContent(res, 'Conteudo Educativo', req.params.id, fields);
});

app.patch("/content/quizzes/:id", (req, res) => {
  const { title, questions } = req.body;
  const fields = {};
  if (title) fields.Title = title;
  if (questions && Array.isArray(questions)) {
    fields.Perguntas = JSON.stringify(questions);
  }
  patchContent(res, 'Quizzes', req.params.id, fields);
});

app.patch("/content/checklists/:id", (req, res) => {
  const { title, items } = req.body;
  const fields = {};
  if (title) fields.titulo = title;
  if (items && Array.isArray(items)) {
    fields.items = JSON.stringify(items);
  }
  patchContent(res, 'Checklists', req.params.id, fields);
});

const deleteRecord = async (tableName, id, res) => {
  console.log(`AVISO: Tentativa de DELETE para ${tableName}/${id} com mock data. Dados não serão removidos.`);
  res.status(200).send({ success: true });
};

app.delete("/content/quizzes/:id", (req, res) => deleteRecord('Quizzes', req.params.id, res));
app.delete("/content/educational-texts/:id", (req, res) => deleteRecord('Conteudo Educativo', req.params.id, res));
app.delete("/content/checklists/:id", (req, res) => deleteRecord('Checklists', req.params.id, res));

// --- NOVAS ROTAS PARA O CHECKLIST DO UTILIZADOR (AINDA COM AIRTABLE) ---
// Estas rotas ainda tentam se comunicar com o Airtable
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
    // Alterado o modelo para gemini-1.0-pro para maior compatibilidade
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
