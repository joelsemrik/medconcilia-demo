import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 PDF files
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Route to parse PDF with Gemini
  app.post("/api/parse-pdf", async (req, res) => {
    try {
      const { fileBase64 } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ error: "No se recibió el archivo PDF en base64." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "La variable de entorno GEMINI_API_KEY no está configurada." });
      }

      // Initialize Gemini Client
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const systemInstruction = 
        "You are a medical billing data extraction expert. Your job is to extract tabular medical consultation data from the attached PDF. " +
        "You must find all consultation rows under the columns Fecha, Paciente, and Cobertura. " +
        "For each consultation row:\n" +
        "1. Extract the date from column 'Fecha' (usually formatted as DD/MM/YYYY or equivalent) and output it in standard YYYY-MM-DD ISO format.\n" +
        "2. Extract the patient name from column 'Paciente'. Keep it exactly as written.\n" +
        "3. Extract the insurance from column 'Cobertura', but truncate it until the first '-' character and trim any leading/trailing whitespace. For example:\n" +
        " - 'SWISS MEDICAL S.A. - Swiss Medical (afil. ...)' becomes 'SWISS MEDICAL S.A.'\n" +
        " - 'OSPE - Plan A-608 (afil. ...)' becomes 'OSPE'\n" +
        " - 'PODER JUDICIAL DE LA NACION (prestador 1534) - BASICO' becomes 'PODER JUDICIAL DE LA NACION (prestador 1534)'\n" +
        " - If there is no '-' character, keep the whole name and trim it.\n" +
        "Only return the structured JSON data as an array.";

      // Call Gemini 3.5-flash which is perfect for general text, multimodal, and PDF extraction
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              // Gemini supports native PDF as inline data
              mimeType: "application/pdf",
              data: fileBase64,
            },
          },
          "Extract all consultations from the document according to the responseSchema and system instructions."
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: {
                  type: Type.STRING,
                  description: "Normalized ISO string of the date (YYYY-MM-DD) from the Fecha column"
                },
                patientName: {
                  type: Type.STRING,
                  description: "Patient name, e.g. SURNAME, FIRST NAME"
                },
                insurance: {
                  type: Type.STRING,
                  description: "The trimmed insurance/cobertura name strictly up to the first '-' character"
                }
              },
              required: ["date", "patientName", "insurance"]
            }
          }
        }
      });

      const textOutput = response.text;
      if (!textOutput) {
        throw new Error("No se produjo texto de respuesta de Gemini.");
      }

      const parsedData = JSON.parse(textOutput.trim());
      res.json(parsedData);
    } catch (err: any) {
      console.error("Error parsing PDF via Gemini API:", err);
      res.status(500).json({ error: err.message || "Error interno al procesar el PDF con Gemini" });
    }
  });

  // Serve static dist in production, use Vite middleware in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
