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

// 1. تعريف الأدوات (Tools): إضافة عميل/مجموعة + تسجيل حركات مالية
const tools = [
  {
    type: 'function',
    function: {
      name: 'createEntity',
      description: 'إنشاء أو إضافة عميل/زبون جديد أو مجموعة/شركة جديدة في النظام',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'اسم العميل أو اسم المجموعة / الشركة',
          },
          entityType: {
            type: 'string',
            enum: ['client', 'group'],
            description: 'نوع الكيان: client للعملاء المباشرين، أو group للمجموعات والشركات',
          },
          notes: {
            type: 'string',
            description: 'ملاحظات إضافية عن العميل أو المجموعة إن وجدت',
          },
        },
        required: ['name', 'entityType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recordMultipleTransactions',
      description: 'تسجيل حركة واحدة أو عدة حركات مالية دفعة واحدة لعميل أو لمجموعة/شركة (لنا/لكم، قبض/صرف)',
      parameters: {
        type: 'object',
        properties: {
          transactions: {
            type: 'array',
            description: 'قائمة بالحركات المالية المطلوب تسجيلها',
            items: {
              type: 'object',
              properties: {
                entityName: {
                  type: 'string',
                  description: 'اسم العميل أو اسم المجموعة/الشركة المراد تسجيل الحركة عليها',
                },
                entityType: {
                  type: 'string',
                  enum: ['client', 'group'],
                  description: 'نوع الكيان إذا ذُكر: client لعميل، group لمجموعة. إذا لم يحدد اتركه فارغاً',
                },
                direction: {
                  type: 'string',
                  enum: ['LANA', 'LAKUM'],
                  description: 'اتجاه الحركة: LANA (لنا/قبض/دين لنا)، LAKUM (لكم/صرف/دفعة للزبون أو المجموعة)',
                },
                amount: {
                  type: 'number',
                  description: 'المبلغ المالي المرقوم للحركة',
                },
                currencyCode: {
                  type: 'string',
                  description: 'رمز العملة مثل USD, SYP, EUR, TRY. إذا لم تذكر اتركها فارغة',
                },
                note: {
                  type: 'string',
                  description: 'ملاحظات أو بيان العملية',
                },
              },
              required: ['entityName', 'direction', 'amount'],
            },
          },
        },
        required: ['transactions'],
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
      return res.status(500).json({ 
        error: 'خطأ من خدمة الذكاء الاصطناعي', 
        details: data.error.message || data.error 
      });
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
    return res.status(500).json({
      error: 'حدث خطأ في السيرفر أثناء معالجة الطلب',
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Server running on port ${PORT}`);
});
