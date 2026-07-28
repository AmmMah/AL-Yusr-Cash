import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// 1. تعريف دالة إضافة العميل بأسلوب JSON Schema القياسي
const tools = [
  {
    type: 'function',
    function: {
      name: 'createClient',
      description: 'إنشاء أو إضافة عميل/زبون/يوزر جديد في النظام',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'اسم العميل أو الشركة أو اليوزر',
          },
          notes: {
            type: 'string',
            description: 'ملاحظات إضافية إن وجدت',
          },
        },
        required: ['name'],
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
    // الاتصال بـ OpenRouter باستخدام fetch العادي
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // نستخدم موديل Gemini 2.0 المجاني المتاح عبر OpenRouter
        model: 'google/gemini-2.0-flash-001:free',
        messages: [{ role: 'user', content: prompt }],
        tools: tools,
        tool_choice: 'auto',
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('OpenRouter API Error:', data.error);
      return res.status(500).json({ error: 'خطأ من الـ AI', details: data.error.message });
    }

    const responseMessage = data.choices[0]?.message;

    // إذا طلب النموذج استدعاء دالة (Function Call)
    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      const functionArgs = JSON.parse(toolCall.function.arguments);

      return res.json({
        type: 'FUNCTION_CALL',
        name: toolCall.function.name,
        args: functionArgs,
      });
    }

    // إذا كان الرد نصياً فقط
    return res.json({
      type: 'TEXT',
      message: responseMessage?.content || '',
    });

  } catch (error) {
    console.error('Error in server process:', error);
    return res.status(500).json({
      error: 'حدث خطأ في معالجة الطلب',
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Server running on port ${PORT}`);
});
