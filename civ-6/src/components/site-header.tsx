"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { trapDialogFocus } from "@/lib/dialog-focus";

const navigation = [
  { href: "/explore", label: "탐험" },
  { href: "/explore?category=leaders", label: "지도자" },
  { href: "/explore?category=civilizations", label: "문명" },
  { href: "/explore?category=cities", label: "도시" },
  { href: "/explore?category=great-people", label: "위인" },
  { href: "/explore?category=great-works", label: "걸작" },
];

export function SiteHeader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchDialogRef = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const dialog = searchDialogRef.current;
    if (!dialog) return;

    if (searchOpen) {
      if (!dialog.open) dialog.showModal();
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => inputRef.current?.focus());
      return () => {
        document.body.style.overflow = previousOverflow;
        if (dialog.open) dialog.close();
      };
    }

    if (dialog.open) dialog.close();
  }, [searchOpen]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const normalized = query.trim();
    router.push(normalized ? `/explore?q=${encodeURIComponent(normalized)}` : "/explore");
    setSearchOpen(false);
  }

  return (
    <>
      <header className="site-header">
        <div className="page-shell flex h-[68px] items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-5 xl:gap-7 lg:flex" aria-label="주요 탐색">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="nav-link">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <button
              className="header-action hidden lg:flex"
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="검색 열기"
            >
              <Search size={18} strokeWidth={1.8} />
              <span>검색</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button mobile-header-action"
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="검색 열기"
            >
              <Search size={20} />
            </button>
            <button
              className="icon-button mobile-header-action"
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
        {menuOpen ? (
          <nav className="mobile-nav page-shell" aria-label="모바일 탐색">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
            <Link href="/about" onClick={() => setMenuOpen(false)}>
              이 아카이브에 관하여
            </Link>
          </nav>
        ) : null}
      </header>

      <dialog
        ref={searchDialogRef}
        className="search-dialog"
        aria-label="아카이브 검색"
        onClose={() => setSearchOpen(false)}
        onKeyDown={trapDialogFocus}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSearchOpen(false);
        }}
      >
          <form className="search-panel" onSubmit={submitSearch}>
            <Search size={24} strokeWidth={1.7} aria-hidden="true" />
            <label className="sr-only" htmlFor="global-search">
              인물, 도시, 문명, 걸작 검색
            </label>
            <input
              id="global-search"
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="선덕여왕, 상트페테르부르크, 사계…"
              autoComplete="off"
            />
            <button className="search-submit" type="submit">
              찾기
            </button>
            <button
              className="search-close icon-button"
              type="button"
              onClick={() => setSearchOpen(false)}
              aria-label="검색 닫기"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </form>
      </dialog>
    </>
  );
}
