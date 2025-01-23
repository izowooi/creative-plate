import torch
from transformers import (
    EncoderDecoderModel,
    PreTrainedTokenizerFast,
    BertJapaneseTokenizer,
)

_model_initialized = False
model = None
src_tokenizer = None
trg_tokenizer = None


def init_translator():
    global _model_initialized, model, src_tokenizer, trg_tokenizer

    if _model_initialized:
        return

    print("Translator 초기화 중... (최초 1회만 수행)")

    encoder_model_name = "cl-tohoku/bert-base-japanese-v2"
    decoder_model_name = "skt/kogpt2-base-v2"

    src_tokenizer = BertJapaneseTokenizer.from_pretrained(encoder_model_name)
    trg_tokenizer = PreTrainedTokenizerFast.from_pretrained(decoder_model_name)
    model = EncoderDecoderModel.from_pretrained("sappho192/aihub-ja-ko-translator")

    _model_initialized = True


def translate_gpt2(text_src):
    init_translator()
    global model, src_tokenizer, trg_tokenizer
    embeddings = src_tokenizer(text_src, return_attention_mask=False, return_token_type_ids=False, return_tensors='pt')
    embeddings = {k: v for k, v in embeddings.items()}
    output = model.generate(**embeddings, max_length=500)[0, 1:-1]
    text_trg = trg_tokenizer.decode(output.cpu())
    return text_trg


def translate_list_gpt2(text_list: list[str]):
    init_translator()
    return [translate_gpt2(txt) for txt in text_list]


if __name__ == "__main__":
    init_translator()
