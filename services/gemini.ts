import { GoogleGenAI, Part } from "@google/genai";
import { AspectRatio, Resolution } from "../types";

// Models
const MODEL_GENERATE = 'gemini-3-pro-image-preview'; // Nano banana pro
const MODEL_EDIT = 'gemini-2.5-flash-image'; // Nano banana / Flash Image

/**
 * Helper to ensure API key is selected for paid models (Veo/Pro Image)
 */
async function ensureApiKey() {
  if (window.aistudio && window.aistudio.hasSelectedApiKey) {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await window.aistudio.openSelectKey();
    }
  }
}

/**
 * Helper to convert a File to base64 string
 */
export const fileToPart = async (file: File): Promise<Part> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Generate 2 images in parallel
 */
export async function generateImages(
  prompt: string,
  systemInstruction: string,
  referenceImages: File[],
  aspectRatio: AspectRatio,
  resolution: Resolution
): Promise<string[]> {
  await ensureApiKey();
  
  // CORRECTION VITE : Utilisation de import.meta.env
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  
  const parts: Part[] = [];
  for (const file of referenceImages) {
    parts.push(await fileToPart(file));
  }
  parts.push({ text: prompt });

  const config = {
    systemInstruction: systemInstruction ? systemInstruction : undefined,
    imageConfig: {
      aspectRatio: aspectRatio,
      imageSize: resolution,
    },
  };

  const requests = [
    ai.models.generateContent({
      model: MODEL_GENERATE,
      contents: { parts },
      config,
    }),
    ai.models.generateContent({
      model: MODEL_GENERATE,
      contents: { parts },
      config,
    })
  ];

  const responses = await Promise.all(requests);
  const images: string[] = [];

  const processResponse = (resp: any) => {
    if (resp.candidates?.[0]?.content?.parts) {
      for (const part of resp.candidates[0].content.parts) {
        if (part.inlineData) {
          images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        }
      }
    }
  };

  responses.forEach(processResponse);
  return images;
}

/**
 * Refine a generated image
 */
export async function refineImage(
  prompt: string,
  base64Image: string,
  systemInstruction?: string,
  referenceImage?: File,
  aspectRatio?: AspectRatio,
  resolution?: Resolution
): Promise<string | null> {
  await ensureApiKey();
  
  // CORRECTION VITE : Utilisation de import.meta.env
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });

  const [header, data] = base64Image.split(',');
  const mimeType = header.split(':')[1].split(';')[0];

  const parts: Part[] = [
    {
      inlineData: {
        data: data,
        mimeType: mimeType,
      },
    },
  ];

  if (referenceImage) {
    parts.push(await fileToPart(referenceImage));
  }

  parts.push({ text: prompt });

  const config: any = {
    systemInstruction: systemInstruction ? systemInstruction : undefined,
    imageConfig: {}
  };

  if (aspectRatio) config.imageConfig.aspectRatio = aspectRatio;
  if (resolution) config.imageConfig.imageSize = resolution;

  const response = await ai.models.generateContent({
    model: MODEL_GENERATE,
    contents: { parts },
    config
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
  }

  return null;
}

/**
 * Edit an image
 */
export async function editImage(
  prompt: string,
  sourceImage: File,
  referenceImage?: File
): Promise<string | null> {
  // CORRECTION VITE : Utilisation de import.meta.env
  const ai = new GoogleGenAI({ apiKey:
