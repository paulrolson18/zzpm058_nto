/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

export interface CarouselProduct {
    id: string;
    caption: string;
    data: {
        name: string;
        price: number;
        imageUrl: string;
        productPageUrl: string;
        inStock: boolean;
        currencyCode: string;
    };
}

interface ProductCarouselBlockProps {
    title: string;
    products: CarouselProduct[];
    onProductClick?: (product: CarouselProduct) => void;
}

const SCROLL_STEP = 148; // card width (136) + gap (12)

export function ProductCarouselBlock({ title, products, onProductClick }: ProductCarouselBlockProps) {
    const { i18n } = useTranslation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateArrows = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 1);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }, []);

    useEffect(() => {
        updateArrows();
    }, [products, updateArrows]);

    const scrollBy = useCallback((direction: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: direction === 'left' ? -SCROLL_STEP : SCROLL_STEP, behavior: 'smooth' });
    }, []);

    if (!products.length) return null;

    return (
        <div className="flex w-full flex-col gap-1.5">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>

            {/* Scroll area with arrow buttons */}
            <div className="relative -mx-4">
                {/* Left arrow + fade */}
                {canScrollLeft && (
                    <>
                        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
                        <button
                            type="button"
                            onClick={() => scrollBy('left')}
                            aria-label="Scroll left"
                            className="absolute left-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border bg-background/90 p-1 shadow-sm backdrop-blur-sm transition-colors hover:bg-muted">
                            <ChevronLeft className="size-3.5 text-foreground" aria-hidden />
                        </button>
                    </>
                )}

                {/* Right arrow + fade */}
                {canScrollRight && (
                    <>
                        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />
                        <button
                            type="button"
                            onClick={() => scrollBy('right')}
                            aria-label="Scroll right"
                            className="absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border bg-background/90 p-1 shadow-sm backdrop-blur-sm transition-colors hover:bg-muted">
                            <ChevronRight className="size-3.5 text-foreground" aria-hidden />
                        </button>
                    </>
                )}

                <div
                    ref={scrollRef}
                    onScroll={updateArrows}
                    className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {products.map((product) => {
                        const { name, price, imageUrl, inStock, currencyCode } = product.data;
                        const formattedPrice = formatCurrency(price, i18n.language, currencyCode);

                        return (
                            <div
                                key={product.id}
                                className="flex min-w-[136px] max-w-[136px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background">
                                <button
                                    type="button"
                                    onClick={() => onProductClick?.(product)}
                                    aria-label={`Ask about ${name}`}
                                    className="w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    <img
                                        src={imageUrl}
                                        alt={name}
                                        className={cn('aspect-square w-full object-cover', !imageUrl && 'bg-muted')}
                                        loading="lazy"
                                    />
                                </button>
                                <div className="flex flex-1 flex-col gap-1 p-2">
                                    <p className="text-[10px] leading-none text-muted-foreground">{product.caption}</p>
                                    <p className="line-clamp-2 text-xs font-semibold leading-tight text-foreground">
                                        {name}
                                    </p>
                                    <p className="text-xs font-medium text-foreground">{formattedPrice}</p>
                                    {!inStock && <p className="text-[10px] text-destructive">Out of stock</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
