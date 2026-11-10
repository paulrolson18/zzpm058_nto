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

import type { LoaderFunctionArgs } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { fetchCategory, fetchCategoriesByIds } from '@/lib/api/categories.server';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ component: 'navigation-category-cache' });
import type { ShopperProducts } from '@/scapi';

export interface NavigationCategory {
    id: string;
    label: string;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
    categories: NavigationCategory[];
    fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

const FIELDS_SELECT = 'id,name,c_showInMenu,onlineSubCategoriesCount';

function flattenTree(
    categories: ShopperProducts.schemas['Category'][],
    breadcrumb: string
): NavigationCategory[] {
    const result: NavigationCategory[] = [];
    for (const cat of categories) {
        if (!cat.id || !cat['c_showInMenu']) continue;
        const label = breadcrumb ? `${breadcrumb} > ${cat.name ?? cat.id}` : (cat.name ?? cat.id);
        result.push({ id: cat.id, label });
        if (cat.categories?.length) {
            result.push(...flattenTree(cat.categories, label));
        }
    }
    return result;
}

export function isNavigationCategoriesCached(
    context: LoaderFunctionArgs['context'],
    source?: string
): boolean {
    const config = getConfig(context);
    const siteCtx = context.get(siteContext);
    const siteId = siteCtx?.site?.id ?? 'default';
    const { rootCategoryId } = config.pages.navigation;
    const cacheKey = `${siteId}:${rootCategoryId}`;
    const cached = cache.get(cacheKey);
    const warm = !!(cached && Date.now() - cached.fetchedAt < TTL_MS);
    if (warm && source) {
        logger.info('navigation-category-cache: cache warm, skipping warm-up', { cacheKey, source, categoryCount: cached!.categories.length });
    }
    return warm;
}

export async function getNavigationCategories(
    context: LoaderFunctionArgs['context'],
    source?: string
): Promise<NavigationCategory[]> {
    const config = getConfig(context);
    const siteCtx = context.get(siteContext);
    const siteId = siteCtx?.site?.id ?? 'default';
    const { rootCategoryId } = config.pages.navigation;

    const cacheKey = `${siteId}:${rootCategoryId}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
        logger.info('navigation-category-cache: cache hit', { cacheKey, source, categoryCount: cached.categories.length });
        return cached.categories;
    }

    logger.info('navigation-category-cache: fetching from SCAPI', { cacheKey, rootCategoryId, source });

    // Fetch root with immediate children (depth 1)
    const root = await fetchCategory(context, rootCategoryId, 1, {
        select: FIELDS_SELECT,
        personalized: 'none',
    });

    const l1Categories = (root.categories ?? []).filter(
        (c) => c['c_showInMenu'] && typeof c.onlineSubCategoriesCount === 'number' && c.onlineSubCategoriesCount > 0
    );

    // Fetch subcategory trees for each visible L1 category (depth 2 = L2 + L3)
    let subtrees: ShopperProducts.schemas['Category'][] = [];
    if (l1Categories.length > 0) {
        subtrees = await fetchCategoriesByIds(
            context,
            l1Categories.map((c) => c.id),
            2,
            { select: FIELDS_SELECT, personalized: 'none' }
        );
    }

    // Merge subtree data back into L1 so flattenTree sees the full depth
    const mergedL1 = l1Categories.map((l1) => {
        const full = subtrees.find((s) => s.id === l1.id);
        return full ?? l1;
    });

    const categories = flattenTree(mergedL1, '');
    cache.set(cacheKey, { categories, fetchedAt: Date.now() });
    logger.info('navigation-category-cache: cache populated', {
        cacheKey,
        categoryCount: categories.length,
        categories: categories.map((c) => `${c.id}: ${c.label}`),
    });
    return categories;
}
