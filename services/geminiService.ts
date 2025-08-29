/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Modality, Type } from "@google/genai";

// In a production environment, it is strongly recommended to use an environment
// variable for the API key rather than hardcoding it.
const API_KEY = "AIzaSyDK0RQ0I8tivTIhutEb20zHh-M5OBnknHE";
const ai = new GoogleGenAI({ apiKey: API_KEY });


// Helper function to convert a File object to a Gemini API Part
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
    
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

const handleApiResponse = (
    response: GenerateContentResponse,
    context: string // e.g., "edit", "filter", "adjustment"
): string => {
    // 1. Check for prompt blocking first
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `Request was blocked. Reason: ${blockReason}. ${blockReasonMessage || ''}`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }

    // 2. Try to find the image part
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        console.log(`Received image data (${mimeType}) for ${context}`);
        return `data:${mimeType};base64,${data}`;
    }

    // 3. If no image, check for other reasons
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        const errorMessage = `Image generation for ${context} stopped unexpectedly. Reason: ${finishReason}. This often relates to safety settings.`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }
    
    const textFeedback = response.text?.trim();
    const errorMessage = `The AI model did not return an image for the ${context}. ` + 
        (textFeedback 
            ? `The model responded with text: "${textFeedback}"`
            : "This can happen due to safety filters or if the request is too complex. Please try rephrasing your prompt to be more direct.");

    console.error(`Model response did not contain an image part for ${context}.`, { response });
    throw new Error(errorMessage);
};

/**
 * Generates an edited image using generative AI based on a text prompt and a specific point.
 * @param originalImage The original image file.
 * @param userPrompt The text prompt describing the desired edit.
 * @param hotspot The {x, y} coordinates on the image to focus the edit.
 * @returns A promise that resolves to the data URL of the edited image.
 */
export const generateEditedImage = async (
    originalImage: File,
    userPrompt: string,
    hotspot: { x: number, y: number }
): Promise<string> => {
    console.log('Starting generative edit at:', hotspot);
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are an expert photo editor AI. Your task is to perform a natural, localized edit on the provided image based on the user's request.
User Request: "${userPrompt}"
Edit Location: Focus on the area around pixel coordinates (x: ${hotspot.x}, y: ${hotspot.y}).

Editing Guidelines:
- The edit must be realistic and blend seamlessly with the surrounding area.
- The rest of the image (outside the immediate edit area) must remain identical to the original.

Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.

Output: Return ONLY the final edited image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and prompt to the model...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [originalImagePart, textPart] },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    console.log('Received response from model.', response);

    return handleApiResponse(response, 'edit');
};

/**
 * Generates an image with a filter applied using generative AI.
 * @param originalImage The original image file.
 * @param filterPrompt The text prompt describing the desired filter.
 * @returns A promise that resolves to the data URL of the filtered image.
 */
export const generateFilteredImage = async (
    originalImage: File,
    filterPrompt: string,
): Promise<string> => {
    console.log(`Starting filter generation: ${filterPrompt}`);
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are an expert photo editor AI. Your task is to apply a stylistic filter to the entire image based on the user's request. Do not change the composition or content, only apply the style.
Filter Request: "${filterPrompt}"

Safety & Ethics Policy:
- Filters may subtly shift colors, but you MUST ensure they do not alter a person's fundamental race or ethnicity.
- You MUST REFUSE any request that explicitly asks to change a person's race (e.g., 'apply a filter to make me look Chinese').

Output: Return ONLY the final filtered image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and filter prompt to the model...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [originalImagePart, textPart] },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    console.log('Received response from model for filter.', response);
    
    return handleApiResponse(response, 'filter');
};

/**
 * Generates an image with a global adjustment applied using generative AI.
 * @param originalImage The original image file.
 * @param adjustmentPrompt The text prompt describing the desired adjustment.
 * @returns A promise that resolves to the data URL of the adjusted image.
 */
export const generateAdjustedImage = async (
    originalImage: File,
    adjustmentPrompt: string,
): Promise<string> => {
    console.log(`Starting global adjustment generation: ${adjustmentPrompt}`);
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are an expert photo editor AI. Your task is to perform a natural, global adjustment to the entire image based on the user's request.
User Request: "${adjustmentPrompt}"

Editing Guidelines:
- The adjustment must be applied across the entire image.
- The result must be photorealistic.

Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.

Output: Return ONLY the final adjusted image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and adjustment prompt to the model...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [originalImagePart, textPart] },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    console.log('Received response from model for adjustment.', response);
    
    return handleApiResponse(response, 'adjustment');
};

/**
 * Performs a virtual try-on, swapping clothing onto a person.
 * @param personImage The original image of the person.
 * @param clothingSourceImage An image containing the clothing items to use.
 * @param itemsToSwap An array of strings identifying which items to swap from the source image (e.g., ['shirt', 'pants']).
 * @returns A promise that resolves to the data URL of the edited image.
 */
export const generateSwappedImage = async (
    personImage: File,
    clothingSourceImage: File,
    itemsToSwap: string[]
): Promise<string> => {
    if (itemsToSwap.length === 0) {
        throw new Error("No clothing items were selected to swap.");
    }

    console.log(`Starting clothing swap with items: ${itemsToSwap.join(', ')}...`);
    
    const personImagePart = await fileToPart(personImage);
    const clothingSourceImagePart = await fileToPart(clothingSourceImage);

    const prompt = `You are an expert virtual stylist AI specializing in photorealistic virtual try-ons and generative infilling. Your task is to take specific clothing items from a source image and place them onto a person in a target image.

**Input Images:**
- The first image provided is the primary image of the person (the target).
- The second image provided is the clothing source image.

**Items to Swap:**
- From the clothing source image, you must identify and use the following item(s): **${itemsToSwap.join(', ')}**.

**Core Objectives:**

1.  **Perfect Pattern & Texture Replication:**
    This is the most important part of your task. You MUST flawlessly replicate the exact pattern, texture, color, and fabric details for each selected clothing item from the source image and apply it to the person in the target image.
    - DO NOT SIMPLIFY: Do not reduce the complexity of the patterns.
    - DO NOT CHANGE: Do not alter the colors or shapes within the patterns.
    - DO NOT OMIT: Do not leave out any details from the original fabrics.
    - ACCURATE DRAPING: The replicated patterns must drape and wrap realistically over the person's body, conforming to their posture and body contours, including natural folds and wrinkles. The pattern should stretch or compress naturally as the fabric would.

2.  **Intelligent Generative Fill:**
    If a new clothing item is shorter than the original one (e.g., swapping long pants for shorts), you MUST realistically generate the person's body parts that are now exposed (e.g., generate the lower legs and feet).
    - The generated body parts must match the person's skin tone, proportions, and the overall lighting of the photo.
    - Ensure a seamless transition between the original photo and the newly generated parts.

**General Instructions:**
1.  **Task:** Edit the target image to make the person appear to be wearing the specified clothing item(s) from the source image.
2.  **Realism:** The final image must be photorealistic. Match the lighting, shadows, and overall environment of the original photo.
3.  **Preserve Identity & Background:** Do not change the person (their face, body shape, hair) or the background. Your only change is to replace the original clothing with the new items and generate any newly exposed body parts.

Output: Return ONLY the final edited image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending images and swap prompt to the model...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [personImagePart, clothingSourceImagePart, textPart] },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    console.log('Received response from model for clothing swap.', response);
    
    return handleApiResponse(response, 'swap');
};

/**
 * Analyzes an image to identify all pieces of clothing present.
 * @param image The image file to analyze.
 * @returns A promise that resolves to an array of strings listing the identified clothing items.
 */
export const identifyClothingItems = async (image: File): Promise<string[]> => {
    console.log(`Identifying clothing items in image...`);

    const imagePart = await fileToPart(image);
    const prompt = `Analyze the provided image of a person and identify all distinct, visible pieces of clothing they are wearing. Be specific and use common names (e.g., 't-shirt', 'jeans', 'sneakers', 'hoodie', 'dress', 'shorts'). If an item is ambiguous, choose the most likely term. Exclude small accessories like watches or jewelry unless they are very prominent. Provide the output as a JSON object. If no person or clothing is clearly visible, return an empty array in the 'clothing_items' field.`;
    const textPart = { text: prompt };

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        clothing_items: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.STRING,
                                description: 'The name of a single piece of clothing, e.g., "t-shirt".',
                            },
                        },
                    },
                    required: ["clothing_items"],
                },
            },
        });

        const jsonStr = response.text.trim();
        // The model might return a markdown code block, so we need to clean it.
        const cleanedJsonStr = jsonStr.replace(/^```json\s*|```\s*$/g, '');
        const result = JSON.parse(cleanedJsonStr);
        console.log('Clothing identification result:', result);
        // The schema nests it, so we extract `clothing_items`
        return result.clothing_items || [];

    } catch (err) {
        console.error("Failed to identify clothing items:", err);
        // If identification fails, return an empty array to indicate no items were found.
        return [];
    }
};
