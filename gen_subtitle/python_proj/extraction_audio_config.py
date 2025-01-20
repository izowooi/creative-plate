class ExtractionAudioConfig:
    def __init__(self, input_video_path, output_audio_path, start_time_sec=0, end_time_sec=300):
        self.input_video_path = input_video_path
        self.output_audio_path = output_audio_path
        self.start_time_sec = start_time_sec
        self.end_time_sec = end_time_sec