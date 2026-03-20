## Basic model info

Model name: prunaai/z-image-turbo
Model description: Z-Image Turbo is a super fast text-to-image model of 6B parameters developed by Tongyi-MAI.


## Model inputs

- prompt (required): Text prompt for image generation (string)
- height (optional): Height of the generated image (integer)
- width (optional): Width of the generated image (integer)
- num_inference_steps (optional): Number of inference steps. (integer)
- guidance_scale (optional): Guidance scale. Should be 0 for Turbo models (number)
- seed (optional): Random seed. Set for reproducible generation (integer)
- go_fast (optional): Apply additional optimizations for faster generation (boolean)
- output_format (optional): Format of the output images (string)
- output_quality (optional): Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (integer)


## Model output schema

{
  "type": "string",
  "title": "Output",
  "format": "uri"
}

If the input or output schema includes a format of URI, it is referring to a file.


## Example inputs and outputs

Use these example outputs to better understand the types of inputs the model accepts, and the types of outputs the model returns:

### Example (https://replicate.com/p/rcy37hj8b9rma0ctr729kg7yr4)

#### Input

```json
{
  "width": 1024,
  "height": 768,
  "prompt": "A hyper-realistic, close-up portrait of a tribal elder from the Omo Valley, painted with intricate white chalk patterns and adorned with a headdress made of dried flowers, seed pods, and rusted bottle caps. The focus is razor-sharp on the texture of the skin, showing every pore, wrinkle, and scar that tells a story of survival. The background is a blurred, smoky hut interior, with the warm glow of a cooking fire reflecting in the subject's dark, soulful eyes. Shot on a Leica M6 with Kodak Portra 400 film grain aesthetic.",
  "output_format": "jpg",
  "guidance_scale": 0,
  "output_quality": 80,
  "num_inference_steps": 8
}
```

#### Output

```json
"https://replicate.delivery/xezq/Sw1oEB6SefvdS0udQwTWRHWMWP6oL190cAeWhGUZQnZG6harA/output_2846560052_0.jpeg"
```


## Model readme

> # Z-Image-Turbo
> 
> An optimized version of Tongyi-MAI's Z-Image-Turbo, accelerated with PrunaAI's compression engine for even faster image generation.
> 
> ## What is the pricing ?
> 
> Pricing is based on image resolution (height × width):
> 
> - Up to 0.5 MP (500,000 pixels): $0.0025
> 
> - Up to 1 MP (1,000,000 pixels): $0.005
> 
> - Up to 2 MP (2,000,000 pixels): $0.01
> 
> ## What is this?
> 
> Z-Image-Turbo is a 6 billion parameter text-to-image model that generates photorealistic images in sub-second time. This version has been optimized by PrunaAI to make it faster while keeping the same quality.
> 
> The model only needs 8 steps to generate an image, which makes it one of the quickest options available. It's especially good at two things: creating photorealistic images and accurately rendering text in both English and Chinese.
> 
> ## What makes it fast?
> 
> The base model uses a technique called Decoupled-DMD (Distribution Matching Distillation), which is a smart way to compress a larger model into a smaller, faster one without losing quality. PrunaAI has added their own optimization layer on top of this, combining techniques like caching, compilation, and quantization to make it run even faster.
> 
> Think of it like this: the original model was already built to be fast, and PrunaAI fine-tuned it even further to squeeze out every bit of performance.
> 
> ## When to use this
> 
> This model works great when you need:
> 
> - **Quick iterations**: Generate images in seconds, perfect for rapid prototyping or exploring ideas
> - **Text in images**: The model handles complex text rendering really well, especially if you need Chinese characters or English text to appear clearly in your images
> - **Photorealistic results**: Strong at generating realistic photographs, portraits, and scenes with natural lighting
> - **Cost-effective generation**: Faster means cheaper, so this is a good choice when you're generating lots of images
> 
> ## Features
> 
> **Photorealistic quality**: Creates images with natural lighting, realistic textures, and believable scenes. The model handles faces, objects, and environments well.
> 
> **Bilingual text rendering**: One of the model's standout features is how well it renders text. If you need text to appear in your images (like signs, book covers, labels, or posters), this model can do it accurately in both English and Chinese.
> 
> **Fast generation**: With only 8 steps needed, you get images in seconds rather than minutes. On enterprise hardware, you're looking at sub-second generation times.
> 
> **Single-stream architecture**: The model uses a Single-Stream Diffusion Transformer architecture, which processes text and image information together efficiently. You don't need to know the technical details, but this design is part of what makes it fast.
> 
> ## Tips for better results
> 
> **Be specific with your prompts**: Detailed descriptions work better. Instead of "a woman," try "a young woman in red traditional clothing with intricate embroidery, soft natural lighting, outdoor setting."
> 
> **Include style keywords**: Mention the artistic style you want, like "photorealistic," "cinematic," "portrait photography," or specific lighting conditions like "golden hour" or "studio lighting."
> 
> **Text rendering works best with clear instructions**: If you want text in your image, be explicit about what the text should say and where it should appear. For example: "a coffee shop storefront with a sign that says 'Morning Brew' in elegant gold lettering."
> 
> **Use the optimal settings**: The model works best at 1024x1024 resolution with 9 inference steps (which actually results in 8 forward passes through the model). Guidance scale should be set to 0.0 for turbo models like this one.
> 
> ## Technical background
> 
> Z-Image-Turbo comes from Tongyi-MAI, part of Alibaba's AI research division. The base model was built using advanced distillation techniques and trained specifically for fast, high-quality generation.
> 
> PrunaAI's optimization engine applies multiple compression techniques to make the model run faster without sacrificing quality. This includes smart caching (reusing computations from previous steps), model compilation (optimizing how the model runs on your hardware), and quantization (using lower precision numbers where it doesn't affect quality).
> 
> The result is a model that's already fast becoming even faster, while maintaining the photorealistic quality and text rendering capabilities of the original.
> 
> ## Who made this?
> 
> The base Z-Image-Turbo model is from Tongyi-MAI, and this optimized version was created by PrunaAI. PrunaAI builds tools to make machine learning models faster and more efficient, working with models across text, image, video, and audio generation.
> 
> The model is open source under the Apache 2.0 license, which means you can use it for commercial projects.
> 
> ## Try it out
> 
> You can try this model on the Replicate playground at [replicate.com/playground](https://replicate.com/playground)

