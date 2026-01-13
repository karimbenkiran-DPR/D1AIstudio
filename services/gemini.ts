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
      // Assume success after dialog close per guidelines
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
  
  // Re-instantiate to capture potentially new API key
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  
  const parts: Part[] = [];
  
  // Add reference images first
  for (const file of referenceImages) {
    parts.push(await fileToPart(file));
  }
  
  // Add text prompt
  parts.push({ text: prompt });

  const config = {
    systemInstruction: systemInstruction ? systemInstruction : undefined,
    imageConfig: {
      aspectRatio: aspectRatio,
      imageSize: resolution,
    },
  };

  // We want 2 distinct images. Parallel requests are the most reliable way 
  // to enforce generation of multiple variations for this specific model API.
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
 * Refine a generated image using the Pro model (Chat flow)
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
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });

  // Parse data URL to get pure base64 and mimeType
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

  // Text prompt
  parts.push({ text: prompt });

  const config: any = {
    systemInstruction: systemInstruction ? systemInstruction : undefined,
    imageConfig: {}
  };

  if (aspectRatio) {
      config.imageConfig.aspectRatio = aspectRatio;
  }
  
  if (resolution) {
      config.imageConfig.imageSize = resolution;
  }

  // Use the same high-quality model for refinement to maintain consistency
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
 * Edit an image (Flash Image model)
 */
export async function editImage(
  prompt: string,
  sourceImage: File,
  referenceImage?: File
): Promise<string | null> {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });

  const parts: Part[] = [];
  parts.push(await fileToPart(sourceImage));
  
  if (referenceImage) {
    parts.push(await fileToPart(referenceImage));
  }
  
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: MODEL_EDIT,
    contents: { parts },
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
 * Generate a new view of an image based on rotation/tilt/zoom parameters
 */
export async function generateAngleVariation(
  sourceImage: File,
  rotation: number,
  tilt: number,
  zoom: string,
  aspectRatio: AspectRatio,
  resolution: Resolution,
  userPrompt?: string
): Promise<string | null> {
  await ensureApiKey();
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });

  const parts: Part[] = [];
  parts.push(await fileToPart(sourceImage));
  
  // Construct a prompt that describes the desired camera movement
  const baseAnglePrompt = `Regenerate this image as if the camera has moved. 
  Camera Rotation: ${rotation} degrees (where 0 is front, positive is rotating right).
  Camera Tilt: ${tilt} degrees (positive is looking down/bird's eye, negative is looking up).
  Zoom Level: ${zoom}.
  Maintain the exact same subject, lighting, and style. Only change the perspective.`;
  
  const fullPrompt = userPrompt ? `${userPrompt}. ${baseAnglePrompt}` : baseAnglePrompt;

  parts.push({ text: fullPrompt });

  const response = await ai.models.generateContent({
    model: MODEL_GENERATE, // Use Pro for high fidelity 3D-like rotations
    contents: { parts },
    config: {
        imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution
        }
    }
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
