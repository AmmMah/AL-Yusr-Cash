import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("❌ OPENROUTER_API_KEY is missing!");
} else {
  console.log("✅ OPENROUTER_API_KEY loaded successfully.");
}

// 1. تعريف الأدوات (Tools): كيانات + حركات + (أمانات وديون: إضافة/تعديل/تسوية)
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
          entityType: {
            type: 'string',
            enum: ['client', 'group'],
            description: 'نوع الكيان: client للعملاء، group للمجموعات',
          },
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
      description: 'تسجيل حركة واحدة أو عدة حركات مالية (لنا/لكم، قبض/صرف) على العملاء أو المجموعات',
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
                amount: { type: 'number', description: 'المبلغ المالي' },
                currencyCode: { type: 'string', description: 'رمز العملة مثل USD, SYP, EUR, TRY' },
                note: { type: 'string', description: 'ملاحظات الحركة' },
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
      description: 'إدارة الأمانات والديون (تسجيل أمانة جديدة، تسجيل دين جديد، تعديل أمانة/دين قائم، أو تسوية/سداد أمانة/دين)',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['CREATE', 'UPDATE', 'SETTLE'],
            description: 'نوع الإجراء: CREATE لإضافة جديدة، UPDATE لتعديل أمانة/دين موجود، SETTLE لتسوية/خلاص/سداد الدين أو الأمانة',
          },
          type: {
            type: 'string',
            enum: ['trust', 'debt'],
            description: 'النوع: trust للأمانة (أمانة لنا أو علينا)، debt للدين (دين ممتاز/خارجي)',
          },
          name: {
            type: 'string',
            description: 'اسم الشخص أو الجهة صاحب الأمانة أو الدين',
          },
          amount: {
            type: 'number',
            description: 'المبلغ (مطلوب في حال الإضافة والتعديل)',
          },
          currencyCode: {
            type: 'string',
            description: 'رمز العملة مثل USD, SYP, EUR, TRY',
          },
          note: {
            type: 'string',
            description: 'ملاحظات أو بيان العملية',
          },
        },
        required: ['action', 'name'],
      },
    },
  },
];

// 2. الـ Endpoint الرئيسية
app.post('/process-ai', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'الطلب فارغ' });
  }

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

    if (data.error) {
      console.error('OpenRouter API Error:', data.error);
      return res.status(500).json({ error: 'خطأ من خدمة الذكاء الاصطناعي', details: data.error.message || data.error });
    }

    const responseMessage = data.choices && data.choices[0] ? data.choices[0].message : null;

    if (!responseMessage) {
      return res.status(500).json({ error: 'لم يتم استلام رد من النموذج' });
    }

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      let functionArgs = {};
      
      try {
        functionArgs = typeof toolCall.function.arguments === 'string' 
          ? JSON.parse(toolCall.function.arguments) 
          : toolCall.function.arguments;
      } catch (e) {
        console.error('Failed to parse function arguments:', e);
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
    console.error('Error in server process:', error);
    return res.status(500).json({ error: 'حدث خطأ في السيرفر أثناء معالجة الطلب', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Server running on port ${PORT}`);
});
