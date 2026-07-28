import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is missing in Environment Variables!');
} else {
  console.log('✅ GROQ_API_KEY loaded successfully.');
}

const groq = new Groq({ apiKey: GROQ_API_KEY });

// 1. تعريف الأدوات (Tools Definitions)
const tools = [
  {
    type: 'function',
    function: {
      name: 'createEntity',
      description: 'إنشاء أو إضافة عميل/زبون جديد أو مجموعة/شركة جديدة في النظام',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'اسم العميل أو اسم المجموعة / الشركة' },
          entityType: { type: 'string', enum: ['client', 'group'], description: 'نوع الكيان' },
          notes: { type: 'string', description: 'ملاحظات إضافية' },
        },
        required: ['name', 'entityType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recordMultipleTransactions',
      description: 'تسجيل حركة واحدة أو عدة حركات مالية لعميل أو لمجموعة/شركة',
      parameters: {
        type: 'object',
        properties: {
          transactions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                entityName: { type: 'string', description: 'اسم العميل أو المجموعة' },
                direction: { type: 'string', enum: ['LANA', 'LAKUM'] },
                amount: { type: 'number' },
                currencyCode: { type: 'string' },
                note: { type: 'string' },
              },
              required: ['entityName', 'direction', 'amount'],
            },
          },
        },
        required: ['transactions'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manageTrustDebt',
      description: 'إدارة الأمانات والديون (تسجيل أمانة جديدة، تسجيل دين جديد، تعديل، أو تسوية/سداد)',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['CREATE', 'UPDATE', 'SETTLE'] },
          type: { type: 'string', enum: ['trust', 'debt'] },
          name: { type: 'string' },
          amount: { type: 'number' },
          currencyCode: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['action', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manageCurrencies',
      description: 'إدارة عملات الدرج وأسعار الصرف (إضافة عملة، تعديل سعر الصرف، حذف عملة، تعديل رصيد الدرج)',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['ADD_CURRENCY', 'UPDATE_RATE', 'DELETE_CURRENCY', 'UPDATE_BALANCE'],
          },
          currencyCode: { type: 'string' },
          currencyName: { type: 'string' },
          exchangeRate: { type: 'number' },
          newBalance: { type: 'number' },
        },
        required: ['action', 'currencyCode'],
      },
    },
  },
];

// 2. الـ Endpoint الرئيسية المعالجة للذكاء الاصطناعي
app.post('/process-ai', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'الطلب فارغ' });
    }

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'مفتاح GROQ_API_KEY غير مضاف في متغيرات البيئة' });
    }

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'أنت مساعد ذكي لتطبيق اليسر لإدارة الحسابات. قم بتحليل طلب المستخدم واستدعي الأدوات المناسبة دائماً بدقة.',
        },
        { role: 'user', content: prompt },
      ],
      tools: tools,
      tool_choice: 'auto',
    });

    const message = response.choices[0].message;
    const toolCalls = message.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      if (toolCalls.length > 1) {
        const calls = toolCalls.map((tc) => ({
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        }));
        return res.json({ type: 'MULTI_FUNCTION_CALL', calls });
      }

      const singleCall = toolCalls[0];
      return res.json({
        type: 'FUNCTION_CALL',
        name: singleCall.function.name,
        args: JSON.parse(singleCall.function.arguments),
      });
    }

    return res.json({
      type: 'TEXT',
      message: message.content || '',
    });
  } catch (error) {
    console.error('Groq API Error:', error);
    return res.status(500).json({
      error: 'حدث خطأ في معالجة Groq API',
      details: error.message || String(error),
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`AI Server running on port ${PORT}`);
});
