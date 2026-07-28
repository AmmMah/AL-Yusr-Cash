import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// التأكد من تحميل المفتاح
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is missing!");
} else {
  console.log("✅ GEMINI_API_KEY loaded successfully.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 1. تعريف دالة إضافة العميل
const createClientDeclaration = {
  name: 'createClient',
  description: 'إنشاء أو إضافة عميل/زبون/يوزر جديد في النظام',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      name: {
        type: SchemaType.STRING,
        description: 'اسم العميل أو الشركة أو اليوزر',
      },
      notes: {
        type: SchemaType.STRING,
        description: 'ملاحظات إضافية إن وجدت',
      },
    },
    required: ['name'],
  },
};

// 2. الـ Endpoint
app.post('/process-ai', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'الطلب فارغ' });
  }

  try {
    // الموديل المستقر والمدعوم رسمياً
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: {
        functionDeclarations: [createClientDeclaration],
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const functionCalls = response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      return res.json({
        type: 'FUNCTION_CALL',
        name: call.name,
        args: call.args,
      });
    }

    return res.json({
      type: 'TEXT',
      message: response.text(),
    });

  } catch (error) {
    console.error('Error calling Gemini API:', error);

    if (error.status === 429) {
      return res.status(429).json({ error: 'تجاوزت الحد المسموح مؤقتاً، انتظر بضع ثوانٍ وأعد المحاولة.' });
    }

    return res.status(500).json({ error: 'حدث خطأ في معالجة الطلب عبر الـ AI', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Server running on port ${PORT}`);
});
