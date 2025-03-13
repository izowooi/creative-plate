import pickle

def save_pickle(pickle_filename):
    data = {
        "openai_api_key": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}

    with open(pickle_filename, "wb") as f:
        pickle.dump(data, f)

def load_pickle(pickle_filename):
    with open (pickle_filename, "rb") as f:
        data = pickle.load(f)
        return data["openai_api_key"]


def test_pickle_save():
    pickle_filename = "secret.pkl"
    save_pickle(pickle_filename)

def test_pickle_load():
    pickle_filename = "secret.pkl"
    api_key = load_pickle(pickle_filename)

    print(f'api_key: {api_key}')


test_pickle_load()


