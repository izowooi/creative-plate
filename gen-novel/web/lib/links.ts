export const bookHref = (id:string) => `/book/?id=${encodeURIComponent(id)}`;
export const episodeHref = (book:string, episode:string) => `/read/?book=${encodeURIComponent(book)}&episode=${encodeURIComponent(episode)}`;
