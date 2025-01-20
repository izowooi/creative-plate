class TranslationConfig:
    def __init__(self, input_file_path, output_file_path, source_lang, target_lang, auth_key):
        self.input_file_path = input_file_path
        self.output_file_path = output_file_path
        self.source_lang = source_lang
        self.target_lang = target_lang
        self.auth_key = auth_key