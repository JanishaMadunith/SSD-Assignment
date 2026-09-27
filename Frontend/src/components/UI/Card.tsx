import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const paddingMap: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export default function Card({ children, className = '', padding = 'md', hover = true }: CardProps) {
  return (
    <div
      className={[
        'rounded-2xl border border-white/70 bg-white/90 shadow-xl backdrop-blur-md transition-all duration-200',
        hover ? 'hover:-translate-y-1 hover:shadow-2xl' : '',
        paddingMap[padding],
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
