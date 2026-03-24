## Basic model info

Model name: kwaivgi/kling-v2.5-turbo-pro
Model description: Kling 2.5 Turbo Pro: Unlock pro-level text-to-video and image-to-video creation with smooth motion, cinematic depth, and remarkable prompt adherence.


## Model inputs

- prompt (required): Text prompt for video generation (string)
- negative_prompt (optional): Things you do not want to see in the video (string)
- start_image (optional): First frame of the video (string)
- end_image (optional): Last frame of the video (string)
- aspect_ratio (optional): Aspect ratio of the video. Ignored if start_image is provided. (string)
- duration (optional): Duration of the video in seconds (integer)
- image (optional): Deprecated: Use start_image instead. (string)


## Model output schema

{
  "type": "string",
  "title": "Output",
  "format": "uri"
}

If the input or output schema includes a format of URI, it is referring to a file.


## Example inputs and outputs

Use these example outputs to better understand the types of inputs the model accepts, and the types of outputs the model returns:

### Example (https://replicate.com/p/75wknmxbfnrme0csg84vagt5qr)

#### Input

```json
{
  "prompt": "a woman is dancing",
  "duration": 5,
  "aspect_ratio": "16:9",
  "guidance_scale": 0.5
}
```

#### Output

```json
"https://replicate.delivery/xezq/17c3JG1SzH6NCduMiKp1Cxyqvpad0GXRf507Pqq5GOqNsZsKA/tmpg4w3kyjz.mp4"
```


### Example (https://replicate.com/p/zz6r0wtn61rma0csg8tr2qnnew)

#### Input

```json
{
  "image": "https://replicate.delivery/pbxt/NmA3RGnKCecr9sJH8yREBWdqKvka91xFfc9mAhxrreYmJClz/man-in-rain.jpeg",
  "prompt": "A man in a trench coat holding a black umbrella walks briskly through the streets of Tokyo on a rainy night, splashing through puddles. A handheld follow-cam shot from his side and slightly behind. The focus is locked on the man, while background neon signs blur into beautiful bokeh. Cyberpunk aesthetic with a film noir quality; the mood is mysterious and lonely. The pavement is slick and wet, reflecting the vibrant neon signs. Individual raindrops are visible, and a light fog hangs in the air.",
  "duration": 5,
  "aspect_ratio": "16:9",
  "guidance_scale": 0.5
}
```

#### Output

```json
"https://replicate.delivery/xezq/ssJoLMbvdLIgIRdWaDY26XEmUJmQfH1Af6He1Z2XHLtqIoxqA/tmpp3vqjumh.mp4"
```


### Example (https://replicate.com/p/gq20bdaybdrm80csg8wbd5vst8)

#### Input

```json
{
  "prompt": "Prompt: Real-time playback. Wide shot of a ruined city: collapsed towers, fires blazing, storm clouds with lightning. Camera drops fast from the sky over burning streets and tilted buildings. Smoke and dust fill the air. A lone hero walks out of the ruins, silhouetted by fire. Camera shifts front: his face is dirty with dust and sweat, eyes firm, a faint smile. Wind blows, debris rises. Extreme close-up: his eyes reflect the approaching enemy. Music and drums hit. Final wide shot: fire forms a blazing halo behind him - reborn in flames with epic cinematic vibe.",
  "duration": 5,
  "aspect_ratio": "16:9",
  "guidance_scale": 0.5
}
```

#### Output

```json
"https://replicate.delivery/xezq/Fez1ZQegP1tyC0f18Qr1WyVpVeGWEYS0GPemdGCI9ayvDhGrC/tmp4s6vgmpf.mp4"
```


### Example (https://replicate.com/p/2xywa79ve9rme0csg909tg18h8)

#### Input

```json
{
  "prompt": "A woman doing an impressive breakdancing performance, including flips and intense spins. The camera is aggressive, precise moves with speed, ramps, and whip-like acceleration and deceleration.",
  "duration": 5,
  "aspect_ratio": "16:9",
  "guidance_scale": 0.5
}
```

#### Output

```json
"https://replicate.delivery/xezq/EnlmUfQrjDTzGaMakDffU94SfsNnrSIcGdK9AlRGi0uDBRjVB/tmptifj8gul.mp4"
```


### Example (https://replicate.com/p/a91f3sfp3drmc0csg9bry7rg34)

#### Input

```json
{
  "prompt": "A skilled parkour athlete sprints through the city, leaping and doing many flips over urban obstacles. FPV tracking shot, swoops and banks with him.",
  "duration": 5,
  "aspect_ratio": "16:9",
  "guidance_scale": 0.5
}
```

#### Output

```json
"https://replicate.delivery/xezq/Lzq3zWbgAH7vCRFyf7xef9AEqfNOK1fYk2ZJfprfEdHaZUasKA/tmpmpzrg66r.mp4"
```


## Model readme

> # Kling 2.5 Turbo Pro (Image-to-Video)
> 
> Kling 2.5 Turbo Pro turns a single image and prompt into cinematic video with fluid motion and exact intent. A new text-timing engine, improved dynamics, and faster inference enable high-speed action and complex camera moves with stable frames, while refined conditioning preserves palette, lighting, and mood.
> 
> ## What makes it stand out?
> 
> * Better prompt understanding:
> 
> Precisely parses multi-step, causal instructions and transforms a single image and prompt into coherent, well-paced shots that remain true to the creative intent.
> 
> * More realistic look & greater stability:
> 
> Improved dynamics and balanced data closely mimic real-world motion, even at high speeds and with complex camera movements. Playback remains smooth with reduced jitters, tears, and drops.
> 
> * Detail & style consistency:
> 
> Refined image conditioning and intensive training maintain color, lighting, brushwork, and mood, ensuring frames are visually unified even during complex motion.
> 
> ## Designed For
> 
> * Marketing & Brand Teams – Style-consistent ads, feature demos, and campaign assets.
> * Creators / YouTubers / Shorts Teams – Stronger narrative flow and motion that boosts watch-through.
> * Film/Animation Studios – Previz, technique exploration, and style studies with reliable dynamics.
> * Education & Training – Turn static diagrams or slides into clear explainer videos.

