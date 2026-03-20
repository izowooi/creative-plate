## Basic model info

Model name: prunaai/p-image
Model description: A sub 1 second text-to-image model built for production use cases.


## Model inputs

- prompt (required): Text prompt for image generation. (string)
- aspect_ratio (optional): Aspect ratio for the generated image. (string)
- width (optional): Width of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 16. (integer)
- height (optional): Height of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 16. (integer)
- prompt_upsampling (optional): Upsample the prompt with an LLM. (boolean)
- seed (optional): Random seed. Set for reproducible generation. (integer)
- disable_safety_checker (optional): Disable safety checker for generated images. (boolean)
- lora_weights (optional): Load LoRA weights. Supports HuggingFace URLs in the format huggingface.co/<owner>/<model-name>[/<lora-weights-file.safetensors>]. HuggingFace LoRAs may require an API token to access, which you can provide in the `hf_api_token` input. (string)
- lora_scale (optional): Determines how strongly the main LoRA should be applied. 0.5 usually works well for most LoRAs. (number)
- hf_api_token (optional): HuggingFace API token. If you're using a HuggingFace LoRAs that needs authentication, you'll need to provide an API token. (string)


## Model output schema

{
  "type": "string",
  "title": "Output",
  "format": "uri"
}

If the input or output schema includes a format of URI, it is referring to a file.


## Example inputs and outputs

Use these example outputs to better understand the types of inputs the model accepts, and the types of outputs the model returns:

### Example (https://replicate.com/p/cv7e2xmze5rm80ctv69rvbyzjr)

#### Input

```json
{
  "prompt": "A photo of a plant nursery entrance features a chalkboard sign reading \"SOTA Efficiency 0.5 cent per image,\" with a purple neon light beside it displaying \"Pruna AI\". Next to it hangs a poster showing a beautiful golden \"P\", and beneath the poster is written \"P-Image made this\u201d. There is a basket with prunes in front of the store. There is a small cute knitted purple prune next to the basket.",
  "aspect_ratio": "16:9"
}
```

#### Output

```json
"https://replicate.delivery/xezq/eeiwWLXjAjr6BkwIBlTTB5x425te5ceFegoSYxIKzMQT1T2tC/output_298662.jpeg"
```


### Example (https://replicate.com/p/p6apf32ycdrma0ctv6bsa1pzf4)

#### Input

```json
{
  "prompt": "Two people sitting at a table at the Oktoberfest. A man wearing a traditional german outfit, there is a tiny golden \"P\" on his chest. In one hand he is holding a beer. Next to him is a french woman with a trench coat that has a glass of red wine in one hand. They are prosting. In front of them is a plate with a pretzel and a croissant. There is a reservation card on the table saying \"Built with Pretzels & Croissants\". The pattern on the table is purple and white. There is a round purple knitted prune toy at the table.",
  "aspect_ratio": "16:9"
}
```

#### Output

```json
"https://replicate.delivery/xezq/7KTOyLjn1A7EMtW0g3HIry8q7Dk6hEAWLehKQjmqaCqPRZ3KA/output_360405.jpeg"
```


### Example (https://replicate.com/p/w409wy5wq9rme0ctv6bvm1z59c)

#### Input

```json
{
  "prompt": "A cat in space jumping towards a golden space capsule. The cat is wearing a purple astronaut suit with golden accents and a golden \"P\" on it. In the space ship one can see a bird wearing a golden puff jacket.  There is only a purple planet in the background.\n",
  "aspect_ratio": "16:9"
}
```

#### Output

```json
"https://replicate.delivery/xezq/Mr5XaTcendQ5AK1Qn9jnx8LJBjUvkgEARzfn6DpDuT74iyuVA/output_334422.jpeg"
```


### Example (https://replicate.com/p/8mgqbwgeadrmc0ctv6cr5nc6sm)

#### Input

```json
{
  "prompt": "a portrait photo of a man on the left and a woman on the right , on the guy's pink t-shirt there is a golden \"P\", on the woman's gold t-shirt it says \"Image\", they are standing on a street in mission district of SF, they hold poles that hold up a banner above their heads that says \"Image Generation in 1 second\", the banner is in beautiful bold serif typography, it is a shimmering white banner, they are standing on a sidewalk.",
  "aspect_ratio": "16:9"
}
```

#### Output

```json
"https://replicate.delivery/xezq/z4diBJXZtgrrOt0PCieG6wfNTaWrkgD1f8UagQvbSHLcIldrA/output_575890.jpeg"
```


### Example (https://replicate.com/p/7fs1ffv5v1rm80ctv6cvz6skzr)

#### Input

```json
{
  "prompt": "A high-quality still life of rare flowers arranged in a glass vase, dewdrops on petals, soft natural lighting, muted colors, calm and aesthetic composition.\n",
  "aspect_ratio": "16:9"
}
```

#### Output

```json
"https://replicate.delivery/xezq/LcIOlDsM5eTlcaNoQYP6eV50dxDBh48Qklz4S3RfkalJJldrA/output_331705.jpeg"
```


### Example (https://replicate.com/p/vwnq4eeh6xrmc0ctv6crk11kw0)

#### Input

```json
{
  "prompt": "An elegant floating marble sculpture of a woman with long, flowing hair, weightlessly in soft lavender clouds. Gentle pastel light diffuses across her polished stone surface, creating subtle iridescent reflections. Fine marble detailing, serene expression, a calm dreamlike atmosphere, ethereal mist, ultra-aesthetic, high-resolution, surreal and tranquil composition. A thin, faint golden halo encircles her head, perfectly symmetrical.",
  "aspect_ratio": "16:9"
}
```

#### Output

```json
"https://replicate.delivery/xezq/4xdlVRCzzc7zIJxeWKpNMtZYt2hh9kBNORfQOKRSjcHAlyuVA/output_169784.jpeg"
```


### Example (https://replicate.com/p/2cwabmhv0xrma0ctv6d8253mar)

#### Input

```json
{
  "prompt": "A quiet amusement park at night, illuminated by old string lights that hang loosely between rusted metal poles. The lights cast a warm, nostalgic glow over empty pathways.\nA carousel stands still at the center, its painted horses frozen mid-stride. The chipped paint and weathered details suggest years of use. The mirrors on the carousel reflect the lights around it, though the reflections are slightly warped by age.\nA cotton-candy stand sits nearby with its striped awning fluttering in a soft breeze. A half-empty popcorn box lies toppled on the ground, its kernels scattered across the pavement. In the distance, a Ferris wheel looms against the night sky, its metal frame outlined by dim bulbs, many of which no longer light up",
  "aspect_ratio": "16:9"
}
```

#### Output

```json
"https://replicate.delivery/xezq/SFf88PbyQu2UJKFgmXqeGpND84uEfZxdUCM5oY65zgn2KldrA/output_9065.jpeg"
```


### Example (https://replicate.com/p/k0ea5akc0srm80ctv6d94mke54)

#### Input

```json
{
  "prompt": "A young woman standing on a quiet balcony at sunrise, her loose linen shirt softly fluttering in the breeze. Her hair is dark, slightly wavy, reflecting the warm orange light of the rising sun. She holds a ceramic mug in both hands, steam curling upward into the cool morning air. Her expression is calm and introspective, eyes half-closed as she looks toward the distant horizon. The balcony railing is made of aged wrought iron. Behind her, sheer white curtains billow gently from an open doorway, glowing faintly as the sunlight passes through them. The atmosphere is peaceful, warm, and quietly intimate \u2014 a moment of personal stillness suspended in golden light.",
  "aspect_ratio": "16:9"
}
```

#### Output

```json
"https://replicate.delivery/xezq/zEwHAOWGQy79Otde3HRaP3eIK16vA353Bq3LTjfN7zKRLldrA/output_300147.jpeg"
```


### Example (https://replicate.com/p/fzfwp4ebnsrme0ctv6db5mq7wc)

#### Input

```json
{
  "prompt": "A massive blue whale gliding just beneath the ocean\u2019s surface, sunlight filtering through the water in golden beams that ripple across its textured skin.\nBubbles trail from its movement, rising upward in glistening strings. Schools of small fish scatter around it, their scales reflecting shifting blues and greens.\nKelp forests sway in the distance, and the seafloor grows faint as it fades into deeper blue.\nThe moment feels ancient, tranquil, and awe-inspiring \u2014 a gentle giant drifting through a cathedral of water and light.",
  "aspect_ratio": "16:9"
}
```

#### Output

```json
"https://replicate.delivery/xezq/qlGaqVRb3U6mMxMoyu4ggEOJcHwjbgcHG1SfvpWlnZcATZ3KA/output_706467.jpeg"
```


### Example (https://replicate.com/p/6018c1j3z9rme0ctv6dv1ved3w)

#### Input

```json
{
  "prompt": "A street musician performing beneath a glowing orange streetlamp at dusk, their violin polished and warm in the fading light.\nTheir case lies open on the cobblestone street beside them, lined with soft velvet and holding scattered coins.\nThe musician\u2019s long coat ripples slightly with each subtle movement of their bow. Behind them, old stone buildings rise with balconies draped in flowering vines, catching the last pink glow of sunset.\n",
  "aspect_ratio": "16:9"
}
```

#### Output

```json
"https://replicate.delivery/xezq/Si368n1Rtw6MKNMqTfcqQReFbbKclSoWh4lsyjA5sz6fMldrA/output_663396.jpeg"
```


### Example (https://replicate.com/p/thfj9rnnndrm80ctv6dvbkejpc)

#### Input

```json
{
  "prompt": "A singer standing alone on a grand theater stage, illuminated by a single spotlight that casts a soft circular glow around their feet. Rows of empty red velvet seats stretch into darkness, and the ornate golden balconies curve overhead with intricate detailing. The singer holds a microphone lightly, eyes closed, as they sing softly into the vast empty space, their voice almost visible in the air as a subtle vibration. A piano sits off to the side, its glossy surface reflecting the spotlight\u2019s halo. The mood is artistic, emotional, and quietly grand.",
  "aspect_ratio": "16:9"
}
```

#### Output

```json
"https://replicate.delivery/xezq/UFB3fB1zmEXMRK7B7jdBJt7egzAeXH3Y5iAKzTrQpzV5NldrA/output_138235.jpeg"
```


## Model readme

> P-Image is Pruna’s premium text-to-image generation model, delivering state-of-the-art AI images in less than one second.
> 
> Designed for professional results, it offers a rare combination of speed, affordability, visual quality, diversity, exact prompt adherence, and exceptional text rendering, making it the go-to choice when you need fast, beautiful, and reliable image generation.
> 
> More info here: https://docs.pruna.ai/en/docs-add-performance-pages/docs_pruna_endpoints/performance_models/p-image.html
> 
> Prompting Guidelines: https://docs.pruna.ai/en/docs-add-performance-pages/docs_pruna_endpoints/image_generation/advanced.html

