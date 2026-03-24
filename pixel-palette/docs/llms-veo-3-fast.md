## Basic model info

Model name: google/veo-3-fast
Model description: A faster and cheaper version of Google’s Veo 3 video model, with audio


## Model inputs

- prompt (required): Text prompt for video generation (string)
- aspect_ratio (optional): Video aspect ratio (string)
- duration (optional): Video duration in seconds (integer)
- image (optional): Input image to start generating from. Ideal images are 16:9 or 9:16 and 1280x720 or 720x1280, depending on the aspect ratio you choose. (string)
- negative_prompt (optional): Description of what to exclude from the generated video (string)
- resolution (optional): Resolution of the generated video (string)
- generate_audio (optional): Generate audio with the video (boolean)
- seed (optional): Random seed. Omit for random generations (integer)


## Model output schema

{
  "type": "string",
  "title": "Output",
  "format": "uri"
}

If the input or output schema includes a format of URI, it is referring to a file.


## Example inputs and outputs

Use these example outputs to better understand the types of inputs the model accepts, and the types of outputs the model returns:

### Example (https://replicate.com/p/rvdw9f861xrme0cqy2g9a1c7bm)

#### Input

```json
{
  "prompt": "gorilla riding a moped through busy italian city",
  "enhance_prompt": true
}
```

#### Output

```json
"https://replicate.delivery/xezq/iY9PbAFJN2LJOBx1imI08Bhz4lJX1ZHBf5WakE1JGNtfKHfpA/tmp8ai_03z8.mp4"
```


### Example (https://replicate.com/p/09chh0rw3hrma0cqy2ma2mqtcm)

#### Input

```json
{
  "prompt": "A breaking news ident, followed by a latina TV news presenter excitedly telling us: We interrupt this program to bring you some breaking news... Veo 3 Fast is now live on Replicate! Back to you Bill.\n\nThe background says \"Veo 3 Fast on Replicate\"",
  "enhance_prompt": true
}
```

#### Output

```json
"https://replicate.delivery/xezq/VleZE1vtsJyLfUxuKcYzsngzUUFrgeeLlqsQdnLdG7sFNd8TB/tmpva5kimdq.mp4"
```


### Example (https://replicate.com/p/x4erjjqy55rmc0cqy2nap3fbr8)

#### Input

```json
{
  "prompt": "A lion running fast through the savannah, dolly zoom into its face\n\nThe lion says in a deep voice: Veo 3 Fast is now on Replicate",
  "enhance_prompt": true
}
```

#### Output

```json
"https://replicate.delivery/xezq/ecejocRJQkkUGUPfWnMf7AIAIlraKuSCd2bdkoeLdqflj1xPF/tmphuw78wy3.mp4"
```


### Example (https://replicate.com/p/atvmr3ss5drma0cqy2ssmy5k3r)

#### Input

```json
{
  "prompt": "A hyper-speed superhero, resembling The Flash, is sprinting through a dense, dark forest at night. The trees blur into streaks of green and black as he moves. Fiery trails burst behind him with every stride, igniting parts of the underbrush in glowing embers. As he weaves between the trees, the blazing trail he leaves behind slowly forms the words 'VEO 3 FAST' in glowing, molten fire on the forest floor. The camera zooms up to show the entire text.",
  "enhance_prompt": true
}
```

#### Output

```json
"https://replicate.delivery/xezq/xKos9IcrsrqrId3eA5bVZxD5m5jWRednYoECfsSaqASM9OeTB/tmpqa0xpc63.mp4"
```


### Example (https://replicate.com/p/s9cvdfdfp1rme0crcvd88c2grg)

#### Input

```json
{
  "image": "https://replicate.delivery/pbxt/NSdAcsNDeUPlnK7X5Kpc2O8ZG7wHuqCVbxI8dtUhApopzOK9/Screenshot%202025-08-01%20at%201.17.27%E2%80%AFPM.png",
  "prompt": "Rotate the shoe, keep everything else still",
  "resolution": "720p"
}
```

#### Output

```json
"https://replicate.delivery/xezq/l8u0QcK58uIQF5IUyYRQeMi0eAjISqU01o6XvY6PWqmEcrGVA/tmp9pdz1bfu.mp4"
```


## Model readme

> ## Veo 3 fast
> 
> A faster and cheaper version of Google’s flagship Veo 3 video model. Now you can generate videos with native audio quickly and cheaply.
> 
> Veo 3 fast still has state of the art quality and prompt following, and sometimes the generated audio outperforms native Veo 3.

