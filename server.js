import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// 1. تعريف الأدوات (Tools)
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
                entityType: { type: 'string', enum: ['client', 'group'] },
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

// 2. الـ Endpoint الرئيسية
app.post('/process-ai', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'الطلب فارغ' });
    }

    if (!OPENROUTER_API_KEY) {
      console.error('❌ OPENROUTER_API_KEY is missing');
      return res.status(500).json({ error: 'مفتاح OpenRouter غير معرف في متغيرات البيئة Environment Variables' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://al-yusr.web.app',
        'X-Title': 'Al-Yusr Cash System',
      },
      body: JSON.stringify({
        model: 'openrouter/free', // اختيار تلقائي لأفضل نموذج مجاني متاح
        messages: [{ role: 'user', content: prompt }],
        tools: tools,
        tool_choice: 'auto',
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error('OpenRouter API Error Details:', data.error);
      return res.status(500).json({ 
        error: 'خطأ من مزود الذكاء الاصطناعي (OpenRouter)', 
        details: data.error?.message || data.error || 'Unknown OpenRouter Error' 
      });
    }

    const responseMessage = data.choices && data.choices[0] ? data.choices[0].message : null;

    if (!responseMessage) {
      return res.status(500).json({ error: 'لم يتم استلام رد صحيح من النموذج' });
    }

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      let functionArgs = {};
      
      try {
        functionArgs = typeof toolCall.function.arguments === 'string' 
          ? JSON.parse(toolCall.function.arguments) 
          : toolCall.function.arguments;
      } catch (e) {
        console.error('Failed to parse arguments:', e);
        functionArgs = toolCall.function.arguments;
      }

      return res.json({
        type: 'FUNCTION_CALL',
        name: toolCall.function.name,
        args: functionArgs,
      });
    }

    return res.json({
      type: 'TEXT',
      message: responseMessage.content || '',
    });

  } catch (error) {
    console.error('Internal Server Exception:', error);
    return res.status(500).json({
      error: 'حدث استثناء داخلي في السيرفر',
      details: error.message || String(error),
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Server running on port ${PORT}`);
});
