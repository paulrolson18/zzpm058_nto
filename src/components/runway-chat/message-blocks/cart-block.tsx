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
import { ChevronDown, ChevronUp, ExternalLink, Minus, Plus, ShoppingCart, Tag } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import type { CartItem, CartResponseBlock } from '../parse-response';

interface CartBlockProps {
    data: CartResponseBlock['data'];
}

function ItemRow({ item, locale, currency }: { item: CartItem; locale: string; currency: string }) {
    const colorVariant = item.variants.find((v) => v.type === 'Color');
    const sizeVariant = item.variants.find((v) => v.type === 'Size');

    return (
        <div className="flex gap-3 py-2">
            {item.imageUrl && (
                <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                />
            )}
            <div className="flex flex-1 flex-col gap-0.5">
                <p className="text-xs font-semibold leading-tight text-foreground">{item.name}</p>
                {colorVariant && (
                    <p className="text-[10px] text-muted-foreground">
                        {colorVariant.lbl}: {colorVariant.value}
                    </p>
                )}
                {sizeVariant && (
                    <p className="text-[10px] text-muted-foreground">
                        {sizeVariant.lbl}: {sizeVariant.value}
                    </p>
                )}
                <p className="text-xs font-medium text-foreground">
                    {formatCurrency(item.itemSubtotal, locale, currency)}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                    <button
                        type="button"
                        className="rounded border border-border p-0.5 text-muted-foreground"
                        aria-label="Decrease quantity"
                        disabled
                    >
                        <Minus className="h-2.5 w-2.5" />
                    </button>
                    <span className="w-5 text-center text-xs tabular-nums">{item.quantity}</span>
                    <button
                        type="button"
                        className="rounded border border-border p-0.5 text-muted-foreground"
                        aria-label="Increase quantity"
                        disabled
                    >
                        <Plus className="h-2.5 w-2.5" />
                    </button>
                </div>
                <button type="button" className="mt-0.5 w-fit text-[10px] font-medium underline text-foreground">
                    Remove
                </button>
            </div>
        </div>
    );
}

export function CartBlock({ data }: CartBlockProps) {
    const { i18n } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const details = data.cart?.cartSummary?.cartDetails;
    if (!details) return null;

    const ccy = details.currencyCode;
    const locale = i18n.language;
    const fmt = (amount: number | null | undefined) =>
        amount != null ? formatCurrency(amount, locale, ccy) : '-';

    return (
        <div className="w-full overflow-hidden rounded-xl border border-border bg-background">
            {/* Toggle row — bodyMessage with chevron */}
            <button
                onClick={() => setExpanded((e) => !e)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
            >
                <ShoppingCart className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                {/* eslint-disable-next-line react/no-danger */}
                <span
                    className="flex-1 text-xs leading-relaxed text-foreground"
                    dangerouslySetInnerHTML={{ __html: details.bodyMessage }}
                />
                {expanded ? (
                    <ChevronUp className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                ) : (
                    <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                )}
            </button>

            {/* Items section — shown when expanded */}
            {expanded && details.items.length > 0 && (
                <div className="border-t border-border px-3">
                    <div className="divide-y divide-border">
                        {details.items.map((item) => (
                            <ItemRow key={item.productId} item={item} locale={locale} currency={ccy} />
                        ))}
                    </div>

                    {/* Summary table */}
                    <div className="border-t border-border py-3 text-xs">
                        <div className="flex justify-between py-0.5">
                            <span className="text-muted-foreground">
                                Subtotal ({details.items.length} {details.items.length === 1 ? 'item' : 'items'})
                            </span>
                            <span>{fmt(details.subtotal)}</span>
                        </div>
                        <div className="flex justify-between py-0.5">
                            <span className="text-muted-foreground">Coupon</span>
                            <span>{fmt(details.couponsDiscount)}</span>
                        </div>
                        <div className="flex justify-between py-0.5">
                            <span className="text-muted-foreground">Promotions</span>
                            <span>{fmt(details.promotionsDiscount)}</span>
                        </div>
                        <div className="flex justify-between py-0.5">
                            <span className="text-muted-foreground">Shipping</span>
                            <span>{details.shippingCost != null ? fmt(details.shippingCost) : '-'}</span>
                        </div>
                        <div className="flex justify-between py-0.5">
                            <span className="text-muted-foreground">Shipping Discount</span>
                            <span>{fmt(details.shippingDiscount)}</span>
                        </div>
                        <div className="flex justify-between py-0.5">
                            <span className="text-muted-foreground">Tax</span>
                            <span>{details.taxes != null ? fmt(details.taxes) : 'TBD'}</span>
                        </div>
                        <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold">
                            <span>Estimated total</span>
                            <span>{fmt(details.total)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Coupon + checkout — always visible */}
            <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
                {/* Coupon input */}
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <Tag className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Enter coupon code"
                        className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    />
                    <span className="text-muted-foreground" aria-hidden>→</span>
                </div>

                {/* Checkout button — outlined */}
                <a
                    href={details.checkoutButtonUrl}
                    className="flex w-full items-center justify-center gap-2 rounded border border-primary px-4 py-2 text-sm font-medium text-primary"
                >
                    <ExternalLink className="h-4 w-4" />
                    Checkout
                </a>

                <p className="text-center text-[10px] text-muted-foreground">
                    Shipping and taxes calculated at checkout.
                </p>
            </div>
        </div>
    );
}
