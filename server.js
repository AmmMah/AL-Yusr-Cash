import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is missing in Environment Variables!');
} else {
  console.log('✅ GEMINI_API_KEY loaded successfully.');
}

// تهيئة عميل Google Gemini
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// 1. تعريف الأدوات (Tools Declarations)
const createEntityTool = {
  name: 'createEntity',
  description: 'إنشاء أو إضافة عميل/زبون جديد أو مجموعة/شركة جديدة في النظام',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'اسم العميل أو اسم المجموعة / الشركة' },
      entityType: { type: Type.STRING, enum: ['client', 'group'], description: 'نوع الكيان' },
      notes: { type: Type.STRING, description: 'ملاحظات إضافية' },
    },
    required: ['name', 'entityType'],
  },
};

const recordMultipleTransactionsTool = {
  name: 'recordMultipleTransactions',
  description: 'تسجيل حركة واحدة أو عدة حركات مالية لعميل أو لمجموعة/شركة',
  parameters: {
    type: Type.OBJECT,
    properties: {
      transactions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            entityName: { type: Type.STRING, description: 'اسم العميل أو المجموعة' },
            direction: { type: Type.STRING, enum: ['LANA', 'LAKUM'] },
            amount: { type: Type.NUMBER },
            currencyCode: { type: Type.STRING },
            note: { type: Type.STRING },
          },
          required: ['entityName', 'direction', 'amount'],
        },
      },
    },
    required: ['transactions'],
  },
};

const manageTrustDebtTool = {
  name: 'manageTrustDebt',
  description: 'إدارة الأمانات والديون (تسجيل أمانة جديدة، تسجيل دين جديد، تعديل، أو تسوية/سداد)',
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ['CREATE', 'UPDATE', 'SETTLE'] },
      type: { type: Type.STRING, enum: ['trust', 'debt'] },
      name: { type: Type.STRING },
      amount: { type: Type.NUMBER },
      currencyCode: { type: Type.STRING },
      note: { type: Type.STRING },
    },
    required: ['action', 'name'],
  },
};

const manageCurrenciesTool = {
  name: 'manageCurrencies',
  description: 'إدارة عملات الدرج وأسعار الصرف (إضافة عملة، تعديل سعر الصرف، حذف عملة، تعديل رصيد الدرج)',
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        enum: ['ADD_CURRENCY', 'UPDATE_RATE', 'DELETE_CURRENCY', 'UPDATE_BALANCE'],
      },
      currencyCode: { type: Type.STRING },
      currencyName: { type: Type.STRING },
      exchangeRate: { type: Type.NUMBER },
      newBalance: { type: Type.NUMBER },
    },
    required: ['action', 'currencyCode'],
  },
};

// 2. الـ Endpoint الرئيسية
app.post('/process-ai', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'الطلب فارغ' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'مفتاح GEMINI_API_KEY غير مضاف في متغيرات البيئة' });
    }

    // استدعاء موديل Gemini 2.5 Flash السريع والمجاني
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        tools: [{
          functionDeclarations: [
            createEntityTool,
            recordMultipleTransactionsTool,
            manageTrustDebtTool,
            manageCurrenciesTool,
          ],
        }],
      },
    });

    // الرد المحتمل من الموديل
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      if (functionCalls.length > 1) {
        const calls = functionCalls.map(fc => ({
          name: fc.name,
          args: fc.args,
        }));
        return res.json({ type: 'MULTI_FUNCTION_CALL', calls });
      }

      const singleCall = functionCalls[0];
      return res.json({
        type: 'FUNCTION_CALL',
        name: singleCall.name,
        args: singleCall.args,
      });
    }

    return res.json({
      type: 'TEXT',
      message: response.text || '',
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({
      error: 'حدث خطأ في معالجة Gemini API',
      details: error.message || String(error),
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Server running on port ${PORT}`);
});
