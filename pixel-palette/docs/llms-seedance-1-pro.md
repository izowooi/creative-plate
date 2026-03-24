## Basic model info

Model name: bytedance/seedance-1-pro
Model description: A pro version of Seedance that offers text-to-video and image-to-video support for 5s or 10s videos, at 480p and 1080p resolution


## Model inputs

- prompt (required): Text prompt for video generation (string)
- image (optional): Input image for image-to-video generation (string)
- last_frame_image (optional): Input image for last frame generation. This only works if an image start frame is given too. (string)
- duration (optional): Video duration in seconds (integer)
- resolution (optional): Video resolution (string)
- aspect_ratio (optional): Video aspect ratio. Ignored if an image is used. (string)
- fps (optional): Frame rate (frames per second) (integer)
- camera_fixed (optional): Whether to fix camera position (boolean)
- seed (optional): Random seed. Set for reproducible generation (integer)


## Model output schema

{
  "type": "string",
  "title": "Output",
  "format": "uri"
}

If the input or output schema includes a format of URI, it is referring to a file.


## Example inputs and outputs

Use these example outputs to better understand the types of inputs the model accepts, and the types of outputs the model returns:

### Example (https://replicate.com/p/npy8wmtxj5rma0cqm8yv75bn0w)

#### Input

```json
{
  "fps": 24,
  "prompt": "The sun rises slowly between tall buildings. [Ground-level follow shot] Bicycle tires roll over a dew-covered street at dawn. The cyclist passes through dappled light under a bridge as the entire city gradually wakes up.",
  "duration": 5,
  "resolution": "1080p",
  "aspect_ratio": "16:9",
  "camera_fixed": false
}
```

#### Output

```json
"https://replicate.delivery/xezq/ClgDLn4vlLosCtQeNCBMfAFxFefS9CwjWr6XkppFrQ2saYoTB/tmp4csnp1gw.mp4"
```


### Example (https://replicate.com/p/mhjkt5cgzsrm80cqm8z8df5d5r)

#### Input

```json
{
  "fps": 24,
  "prompt": "A skier glides over fresh snow, kicking up large clouds of snow as he turns. Accelerating gradually down the slope, the camera moves smoothly alongside.",
  "duration": 5,
  "resolution": "1080p",
  "aspect_ratio": "16:9",
  "camera_fixed": false
}
```

#### Output

```json
"https://replicate.delivery/xezq/DfgnKlBwYW38OSSOyeeJ2seBqpDLjX1e7FxJxXFpahkDfhhOF/tmp0ht3v7vp.mp4"
```


## Model readme

> # Seedance 1.0
> 
> A video generation model that creates videos from text prompts and images.
> 
> ## Core Capabilities
> 
> ### Video Generation
> - **Text-to-Video (T2V)**: Generate videos from text descriptions
> - **Image-to-Video (I2V)**: Generate videos from static images with optional text prompts
> - **Resolution**: Outputs 1080p videos
> 
> ### Motion and Dynamics
> - Wide dynamic range supporting both subtle and large-scale movements
> - Maintains physical realism and stability across motion sequences
> - Handles complex action sequences and multi-agent interactions
> 
> ### Multi-Shot Support
> - Native multi-shot video generation with narrative coherence
> - Maintains consistency in subjects, visual style, and atmosphere across shot transitions
> - Handles temporal and spatial shifts between scenes
> 
> ### Style and Aesthetics
> - Supports diverse visual styles: photorealism, cyberpunk, illustration, felt texture, and others
> - Interprets stylistic prompts accurately
> - Maintains cinematic quality with rich visual details
> 
> ### Prompt Understanding
> - Parses natural language descriptions effectively
> - Stable control over camera movements and positioning
> - Accurate interpretation of complex scene descriptions
> - Strong prompt adherence across generated content
> 
> ## Technical Specifications
> 
> - **Model Version**: 1.0
> - **Output Resolution**: 1080p
> - **Input Types**: Text prompts, images (for I2V mode)
> - **Video Length**: Multi-shot capable (specific duration limits not specified)
> 
> ## Model Performance
> 
> Based on internal benchmarks using SeedVideoBench-1.0 and third-party evaluations:
> 
> - High scores in prompt adherence
> - Strong motion quality ratings
> - Competitive aesthetic quality
> - Effective source image consistency in I2V tasks
> 
> ## Use Cases
> 
> - Creative video content generation
> - Prototype development for film and animation
> - Commercial video production
> - Educational and documentary content
> - Fantasy and surreal video creation
> 
> ## Limitations
> 
> - Performance metrics based on specific benchmark datasets
> - Actual generation quality may vary with prompt complexity
> - Multi-shot consistency depends on prompt clarity and scene descriptions

