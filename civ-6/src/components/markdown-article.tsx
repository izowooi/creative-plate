import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingId } from "@/lib/presentation";

function textContent(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textContent).join("");
  if (children && typeof children === "object" && "props" in children) {
    return textContent((children as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return "";
}

const components: Components = {
  h2: ({ children }) => {
    const title = textContent(children);
    return <h2 id={headingId(title)}>{children}</h2>;
  },
  h3: ({ children }) => {
    const title = textContent(children);
    return <h3 id={headingId(title)}>{children}</h3>;
  },
  a: ({ href = "", children }) => {
    const external = href.startsWith("http");
    return (
      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
        {children}
      </a>
    );
  },
};

export function MarkdownArticle({ markdown }: { markdown: string }) {
  return (
    <div className="article-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
