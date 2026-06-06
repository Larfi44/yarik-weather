'use client';

import { useState } from 'react';
import { Language } from '@/lib/settings';

interface SearchBarProps {
  lang: Language;
  onSearch: (city: string) => void;
}

export default function SearchBar({ lang, onSearch }: SearchBarProps) {
  const [city, setCity] = useState('');

  const handleSearch = () => {
    const trimmed = city.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <div className="search-container">
      <input
        className="city-input"
        placeholder={lang === Language.English ? 'Enter city name...' : 'Введите название города...'}
        value={city}
        onChange={e => setCity(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
      />
      <button className="search-btn" onClick={handleSearch}>
        {lang === Language.English ? 'Search' : 'Поиск'}
      </button>
    </div>
  );
}
