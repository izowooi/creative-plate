## Basic model info

Model name: bytedance/seedance-1-pro-fast
Model description: A faster and cheaper version of Seedance 1 Pro


## Model inputs

- resolution (optional): Video resolution (string)
- aspect_ratio (optional): Video aspect ratio. Ignored if an image is used. (string)
- fps (optional): Frame rate (frames per second) (integer)
- seed (optional): Random seed. Set for reproducible generation (integer)
- image (optional): Input image for image-to-video generation (string)
- prompt (required): Text prompt for video generation (string)
- duration (optional): Video duration in seconds (integer)
- camera_fixed (optional): Whether to fix camera position (boolean)


## Model output schema

{
  "type": "string",
  "title": "Output",
  "format": "uri"
}

If the input or output schema includes a format of URI, it is referring to a file.


## Example inputs and outputs

Use these example outputs to better understand the types of inputs the model accepts, and the types of outputs the model returns:

### Example (https://replicate.com/p/8mdm1arx75rme0ct2r19ytsfmg)

#### Input

```json
{
  "fps": 24,
  "prompt": "a giraffe is ice skating, she is skating very fast on an olympic ice rink, live action televised footage, fixed camera",
  "duration": 5,
  "resolution": "480p",
  "aspect_ratio": "16:9",
  "camera_fixed": false
}
```

#### Output

```json
"https://replicate.delivery/xezq/ffNF53gimFsZEkx4q9E9n0sBMP1o3yCF4jtq0MaUa3y7bRiVA/tmpjqem9veb.mp4"
```


### Example (https://replicate.com/p/tw1sj1j379rmc0ct2rctvhm17r)

#### Input

```json
{
  "fps": 24,
  "prompt": "high speed supercar driving on the beach at sunset",
  "duration": 5,
  "resolution": "1080p",
  "aspect_ratio": "16:9",
  "camera_fixed": false
}
```

#### Output

```json
"https://replicate.delivery/xezq/BAXqDRXeSX1OaKO1UqVfscBqLUeG615fThsyVbGUuFc4PHJWB/tmpuhvidghz.mp4"
```


### Example (https://replicate.com/p/3h20a6dv51rm80ct2rcv8h2acw)

#### Input

```json
{
  "fps": 24,
  "prompt": "a tiger walks through a bamboo forest",
  "duration": 5,
  "resolution": "480p",
  "aspect_ratio": "16:9",
  "camera_fixed": false
}
```

#### Output

```json
"https://replicate.delivery/xezq/KQGCrRdC7QobCNu9YCmOxuDV4yeeV3otFgarfWdyvI4QojErA/tmp2p7qw__y.mp4"
```


### Example (https://replicate.com/p/448ts5vtfdrm80ct2rd8x56814)

#### Input

```json
{
  "fps": 24,
  "prompt": "high speed supercar driving on the beach at sunset",
  "duration": 5,
  "resolution": "720p",
  "aspect_ratio": "16:9",
  "camera_fixed": false
}
```

#### Output

```json
"https://replicate.delivery/xezq/QRyLrVgh2npEHFQiYkHtPLXqgpQpbv9frrEs9qeU8JMF1RiVA/tmpm028jkih.mp4"
```


## Model readme

> # Seedance 1.0 Pro Fast
> 
> Seedance 1.0 Pro Fast is a cinematic AI video generation model optimized for faster inference and lower compute cost while maintaining high visual fidelity.
> 
> - **30–60% faster inference** compared to Seedance 1.0 Pro  
> - **~60% reduced compute cost** vs. Seedance 1.0 Pro  
> - **Higher visual quality** than Seedance 1.0 Lite  
> - Same model family architecture and motion control approaches as Seedance 1.0 Pro
> 
> ## Intended Use
> 
> Designed for teams requiring:
> 
> - Rapid iteration in video generation pipelines
> - Efficient previewing during the creative process
> - Balanced cost-to-quality performance for large-scale workloads
> 
> Typical application areas include:
> 
> - Prototyping animated concepts
> - Storyboarding
> - In-product creative tools
> - Platform-scale media generation
> 
> ## Features
> 
> | Capability | Description |
> |-----------|-------------|
> | Inference Optimization | Reduced latency and improved throughput |
> | Motion Control | Consistent motion with reduced artifacts |
> | Visual Fidelity | Comparable to Pro tier for most narrative content |
> | Scaling Support | Suitable for batch and real-time workloads |
> 
> ## Performance Notes
> 
> - Latency improvements vary depending on provider hardware
> - Best performance achieved with mixed-precision GPU inference
> - Intended for 2D cinematic video (not optimized for 3D or physics-based realism)
> 
> ---
> 
> **Try the model yourself on the [Replicate Playground](https://replicate.com/google/nano-banana)** to explore its capabilities and see how it can enhance your creative workflow.

