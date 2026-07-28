import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// أدوات الذكاء الاصطناعي الشاملة (Entities + Transactions + TrustDebt + Currencies)
const tools = [
  {
    type: 'function',
    function: {
      name: 'createEntity',
      description: 'إنشاء عميل جديد أو مجموعة/شركة جديدة',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'اسم العميل أو المجموعة' },
          entityType: { type: 'string', enum: ['client', 'group'] },
          notes: { type: 'string' },
        },
        required: ['name', 'entityType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recordMultipleTransactions',
      description: 'تسجيل حركة واحدة أو عدة حركات مالية (لنا/لكم) لعميل أو عدة عملاء',
      parameters: {
        type: 'object',
        properties: {
          transactions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                entityName: { type: 'string' },
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
      description: 'إدارة الأمانات والديون (إضافة، تعديل، تسوية/سداد/خلاص)',
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
            description: 'نوع العملية على العملة'
          },
          currencyCode: { type: 'string', description: 'رمز العملة مثل EUR, TRY, SYP, SAR, CAD' },
          currencyName: { type: 'string', description: 'اسم العملة بالعربي مثل ليرة تركية، يورو' },
          symbol: { type: 'string', description: 'رمز العملة الشكلِي مثل $, €, ₺' },
          exchangeRate: { type: 'number', description: 'سعر الصرف مقابل العملة الأساسية USD' },
          newBalance: { type: 'number', description: 'الرصيد الجديد للعملة في الدرج عند التعديل المباشر' },
        },
        required: ['action', 'currencyCode'],
      },
    },
  },
];

app.post('/process-ai', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'الطلب فارغ' });

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://al-yusr.web.app',
        'X-Title': 'Al-Yusr Cash System',
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [{ role: 'user', content: prompt }],
        tools: tools,
        tool_choice: 'auto',
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: 'خطأ من خدمة AI', details: data.error });

    const responseMessage = data.choices?.[0]?.message;
    if (!responseMessage) return res.status(500).json({ error: 'لم يتم استلام رد' });

    // في حال رجوع عدة أداوات (Multi-Tool Calls) أو أداة واحدة
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const calls = responseMessage.tool_calls.map(tc => {
        let args = {};
        try { args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments; } catch (e) {}
        return { name: tc.function.name, args };
      });

      return res.json({ type: 'MULTI_FUNCTION_CALL', calls });
    }

    return res.json({ type: 'TEXT', message: responseMessage.content || '' });

  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ في السيرفر', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI Server running on port ${PORT}`));
