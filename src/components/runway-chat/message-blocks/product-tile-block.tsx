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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, ShoppingCart } from 'lucide-react';
import ImageNavArrows from '@/components/image-nav-arrows';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

export interface ProductTileVariantAttr {
    id: string;
    lbl: string;
    opts: Array<{ val: string; ord: boolean; name: string }>;
}

export interface ProductTileData {
    id: string;
    data: {
        id: string;
        name: string;
        dscr: string;
        imageUrl: string;
        pr: { prom: number | null; orig: number; cur: number };
        ccy: string;
        dfOrd: boolean;
        vattr?: ProductTileVariantAttr[];
        vmat?: Array<{
            vars: Record<string, string>;
            pr: number | null;
            pid: string;
            ord: boolean;
        }>;
        quantity?: {
            minQuantity: number;
            maxQuantity: number;
            increment: number;
        };
        imgGroups?: Array<{
            viewType: string;
            vattr: Array<{ vals: string[]; id: string }> | null;
            imgs: Array<{ url: string }>;
        }>;
        baseUrl?: string;
        slugUrl?: string;
        extendedData?: {
            inventory?: {
                orderable: boolean;
                stockLevel: number;
            };
        };
    };
}

interface ProductTileBlockProps {
    product: ProductTileData;
    onAction?: (text: string) => void;
}

export function ProductTileBlock({ product, onAction }: ProductTileBlockProps) {
    const { i18n } = useTranslation();
    const { name, dscr, imageUrl, pr, ccy, dfOrd, vattr, vmat, quantity: quantityConfig, imgGroups, baseUrl, extendedData } =
        product.data;

    const currentPrice = formatCurrency(pr.cur, i18n.language, ccy);
    const originalPrice = pr.orig > pr.cur ? formatCurrency(pr.orig, i18n.language, ccy) : null;
    const promoPrice = pr.prom != null ? formatCurrency(pr.prom, i18n.language, ccy) : null;
    const displayPrice = promoPrice ?? currentPrice;
    const strikePrice = promoPrice != null ? currentPrice : originalPrice;

    const orderable = extendedData?.inventory?.orderable ?? dfOrd;

    const colors = vattr?.find((a) => a.id === 'Color')?.opts.map((o) => o.name) ?? [];
    const swatchImg = imgGroups?.find((g) => g.viewType === 'swatch')?.imgs[0]?.url;
    const swatchUrl = baseUrl && swatchImg ? `${baseUrl}${swatchImg}` : null;
    const sizeOpts = vattr?.find((a) => a.id === 'Size')?.opts ?? [];

    // Image gallery — use hi-res images without color filter, fallback to imageUrl
    const galleryImages = imgGroups
        ?.filter((g) => g.viewType === 'hi-res' && g.vattr === null)
        .flatMap((g) => g.imgs.map((img) => `${baseUrl ?? ''}${img.url}`));
    const images = galleryImages?.length ? galleryImages : [imageUrl];
    const [imageIndex, setImageIndex] = useState(0);

    const defaultSize = sizeOpts.find((s) => s.ord)?.val ?? null;
    const [selectedSize, setSelectedSize] = useState<string | null>(defaultSize);

    const min = quantityConfig?.minQuantity ?? 1;
    const max = quantityConfig?.maxQuantity ?? 99;
    const step = quantityConfig?.increment ?? 1;
    const [quantity, setQuantity] = useState(min);

    const selectedVariant = vmat?.find((v) => v.vars['Size'] === selectedSize);
    const canAdd = orderable && !!selectedVariant?.ord;

    const selectedSizeOpt = sizeOpts.find((o) => o.val === selectedSize);
    const colorName = colors.join(', ');

    const handleAddToCart = () => {
        if (!selectedVariant || !onAction) return;
        onAction(
            `Add ${quantity} of ${name} to my cart (Color: ${colorName}, Size: ${selectedSizeOpt?.name ?? selectedSize}) [SKU: ${selectedVariant.pid}]`
        );
    };

    return (
        <div className="w-full overflow-hidden rounded-xl border border-border bg-background">
            {/* Image gallery */}
            <div className="relative aspect-square w-full">
                <img
                    src={images[imageIndex]}
                    alt={name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                />
                {images.length > 1 && (
                    <ImageNavArrows
                        currentIndex={imageIndex}
                        imageCount={images.length}
                        onIndexChange={setImageIndex}
                        size="sm"
                    />
                )}
            </div>

            {/* Details */}
            <div className="flex flex-col gap-2 p-3">
                <p className="text-sm font-semibold leading-tight text-foreground">{name}</p>

                {/* Price */}
                <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-medium text-foreground">{displayPrice}</span>
                    {strikePrice && (
                        <span className="text-xs text-muted-foreground line-through">{strikePrice}</span>
                    )}
                </div>

                {/* Short description */}
                <p className="text-xs text-muted-foreground leading-relaxed">{dscr}</p>

                {/* Colors */}
                {colors.length > 0 && (
                    <div className="flex flex-col gap-0.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Color</p>
                        <div className="flex items-center gap-2">
                            {swatchUrl && (
                                <img
                                    src={swatchUrl}
                                    alt=""
                                    aria-hidden
                                    className="h-5 w-5 flex-shrink-0 rounded-full border border-border object-cover"
                                />
                            )}
                            <p className="text-xs text-foreground">{colors.join(', ')}</p>
                        </div>
                    </div>
                )}

                {/* Sizes */}
                {sizeOpts.length > 0 && (
                    <div className="flex flex-col gap-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Size
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {sizeOpts.map((opt) => (
                                <button
                                    key={opt.val}
                                    onClick={() => setSelectedSize(opt.val)}
                                    className={cn(
                                        'rounded border px-1.5 py-0.5 text-[10px] transition-colors',
                                        selectedSize === opt.val
                                            ? 'border-foreground bg-foreground text-background'
                                            : 'border-border text-foreground hover:border-foreground',
                                    )}
                                >
                                    {opt.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Quantity */}
                {orderable && (
                    <div className="flex flex-col gap-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Quantity
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setQuantity((q) => Math.max(min, q - step))}
                                disabled={quantity <= min}
                                className="rounded border border-border p-1 disabled:opacity-40 hover:border-foreground transition-colors"
                                aria-label="Decrease quantity"
                            >
                                <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
                            <button
                                onClick={() => setQuantity((q) => Math.min(max, q + step))}
                                disabled={quantity >= max}
                                className="rounded border border-border p-1 disabled:opacity-40 hover:border-foreground transition-colors"
                                aria-label="Increase quantity"
                            >
                                <Plus className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Stock status */}
                {!orderable && (
                    <p className="text-[10px] font-medium text-destructive">Out of stock</p>
                )}

                {/* Add to cart */}
                {orderable && (
                    <button
                        type="button"
                        onClick={handleAddToCart}
                        disabled={!canAdd}
                        className="mt-1 flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 transition-opacity"
                    >
                        <ShoppingCart className="h-4 w-4" />
                        Add to cart
                    </button>
                )}
            </div>
        </div>
    );
}
