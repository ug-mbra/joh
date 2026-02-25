// Configuration
const PRODUCTS_JSON_URL = 'https://basil87998-dot.github.io/cloudinary-gallery/public/products.json';
const CACHE_KEY = 'joh_products_cache';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const RETRY_DELAY = 5000; // 5 seconds between retries
const MAX_RETRIES = 3;
const DEFAULT_CATEGORY = 'desktops'; // Add this constant for default category

// DOM Elements
const gallery = document.getElementById('featured-products');
const searchInput = document.getElementById('search-input');
const searchInfo = document.getElementById('search-info');
const refreshBtn = document.getElementById('refresh-btn');
const loadingElement = document.getElementById('loading');
const noResultsElement = document.getElementById('no-results');
const lastUpdatedElement = document.getElementById('last-updated');
const categoryFilter = document.getElementById('category-filter');
const sortBy = document.getElementById('sort-by');
const updateInfo = document.getElementById('update-info');
const statsBox = document.getElementById('stats-box');
const totalProductsElement = document.getElementById('total-products');
const totalCategoriesElement = document.getElementById('total-categories');
const priceRangeElement = document.getElementById('price-range');
const totalSizeElement = document.getElementById('total-size');

// Global state
let allProducts = [];
let retryCount = 0;
let categories = new Set();
let lastLoadTime = null;
let useDefaultCategory = true; // Track if we should use default category

// Utility functions
function formatPrice(price) {
    if (!price || price === '0.00') return 'Free';
    const num = parseFloat(price);
    if (isNaN(num)) return `${price}/=`;
    return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateString;
    }
}

function formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return formatDate(date);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function extractCategories(products) {
    const categoriesSet = new Set(['All Categories']);
    products.forEach(product => {
        // Try multiple possible paths for category
        const category = product.context?.custom?.category || 
                        product.context?.category || 
                        'Uncategorized';
        if (category) categoriesSet.add(category);
    });
    return Array.from(categoriesSet);
}

function populateCategoryFilter(categories) {
    categoryFilter.innerHTML = '';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category === 'All Categories' ? '' : category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
    
    // Check if default category exists
    const defaultCategoryExists = categories.some(cat => 
        cat === DEFAULT_CATEGORY
    );
    
    if (defaultCategoryExists) {
        categoryFilter.value = DEFAULT_CATEGORY;
        console.log(`📌 Default category "${DEFAULT_CATEGORY}" set in filter`);
    } else {
        console.log(`⚠️ Default category "${DEFAULT_CATEGORY}" not found in categories`);
        // Don't set the filter value - we'll handle it differently
    }
}


function updateStatistics(products) {
    if (products.length === 0) {
        statsBox.style.display = 'none';
        return;
    }
    
    statsBox.style.display = 'flex';
    
    // Count categories
    const categorySet = new Set();
    const prices = [];
    let totalSize = 0;
    
    products.forEach(product => {
        // Try multiple possible paths for category
        const category = product.context?.custom?.category || 
                        product.context?.category || 
                        'Uncategorized';
        categorySet.add(category);
        
        // Try multiple possible paths for price
        const price = parseFloat(product.context?.custom?.price || 
                               product.context?.price || 
                               0);
        if (!isNaN(price)) prices.push(price);
        
        totalSize += product.bytes || 0;
    });
    
    totalProductsElement.textContent = products.length;
    totalCategoriesElement.textContent = categorySet.size;
    
    // Price range
    if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        priceRangeElement.textContent = `${minPrice.toFixed(2)}/= - ${maxPrice.toFixed(2)}/=`;
    } else {
        priceRangeElement.textContent = 'No prices';
    }
    
    totalSizeElement.textContent = formatBytes(totalSize);
}

 
 
 
function createProductCard(product) {
    // Try multiple possible paths for product data
    const context = product.context || {};
    const custom = context.custom || {};
    const name = custom.name || context.name || 'Unnamed Product';
    const price = formatPrice(custom.price || context.price);
    const description = custom.description || context.description || 'No description available';
    const category = custom.category || context.category || 'Uncategorized';
    
    // Format dates
    const createdDate = formatDate(product.created_at);
    const timeAgo = formatTimeAgo(product.created_at);
    
    // Image URL
    const imageUrl = product.secure_url || product.url || 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80';
    
    return `
        <div class="product-card" data-category="${category}" data-price="${parseFloat(custom.price || context.price || 0)}" data-date="${product.created_at}">
            <div class="product-image">
                <img src="${imageUrl}" 
                    alt="${name}" 
                    loading="lazy"
                    width="400"
                    height="300"
                    onerror="this.src='https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80'">
                <span class="product-badge">${category}</span>
            </div>
            <div class="product-content">
                <div class="product-header">
                    <h3 class="product-title" title="${name}">${name}</h3>
                    <span class="product-price">${price}</span>
                </div>
                <p class="product-description">${description}</p>
                <div class="product-footer">
                    <span class="product-category">
                        <i class="fas fa-tag"></i> ${category}
                    </span>
                    <span class="product-date" title="${createdDate}">
                        <i class="far fa-clock"></i> ${timeAgo}
                    </span>
                </div>
                <div class="product-actions">
                    <a href="${imageUrl}" target="_blank" class="action-btn" title="View full size">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                    <button class="action-btn" onclick="shareProduct('${name}', '${imageUrl}')" title="Share">
                        <i class="fas fa-share-alt"></i>
                    </button>
                    <a href="https://wa.me/256776576547?text=I'm%20interested%20in%20${encodeURIComponent(name)}" target="_blank" class="action-btn" title="Buy on WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                    </a>
                </div>
            </div>
        </div>
    `;
}

function filterProducts(searchTerm, category = '', useDefault = false) {
    const term = searchTerm.toLowerCase().trim();
    
    let filtered = allProducts;
    
    // Apply category filter - IMPORTANT: if useDefault is true, always use DEFAULT_CATEGORY
    const categoryToUse = useDefault ? DEFAULT_CATEGORY : category;
    
    if (categoryToUse) {
        console.log(`🔍 Filtering by category: "${categoryToUse}" (useDefault: ${useDefault})`);
        filtered = filtered.filter(product => {
            // Try multiple possible paths for category
            const productCategory = product.context?.custom?.category || 
                                  product.context?.category || 
                                  'Uncategorized';
            return productCategory === categoryToUse;
        });
    } else {
        console.log('🔍 No category filter applied');
    }
    
    // Apply search filter
    if (term) {
        filtered = filtered.filter(product => {
            const context = product.context || {};
            const custom = context.custom || {};
            
            const name = (custom.name || context.name || '').toLowerCase();
            const description = (custom.description || context.description || '').toLowerCase();
            const category = (custom.category || context.category || '').toLowerCase();
            const filename = (product.filename || '').toLowerCase();
            
            return name.includes(term) || 
                    description.includes(term) || 
                    category.includes(term) ||
                    filename.includes(term);
        });
    }
    
    console.log(`📊 Filtered to ${filtered.length} products`);
    return filtered;
}

function sortProducts(products, sortType) {
    const sorted = [...products];
    
    switch (sortType) {
        case 'name-asc':
            sorted.sort((a, b) => {
                const aName = (a.context?.custom?.name || a.context?.name || '');
                const bName = (b.context?.custom?.name || b.context?.name || '');
                return aName.localeCompare(bName);
            });
            break;
        case 'name-desc':
            sorted.sort((a, b) => {
                const aName = (a.context?.custom?.name || a.context?.name || '');
                const bName = (b.context?.custom?.name || b.context?.name || '');
                return bName.localeCompare(aName);
            });
            break;
        case 'price-asc':
            sorted.sort((a, b) => {
                const priceA = parseFloat(a.context?.custom?.price || a.context?.price || 0);
                const priceB = parseFloat(b.context?.custom?.price || b.context?.price || 0);
                return priceA - priceB;
            });
            break;
        case 'price-desc':
            sorted.sort((a, b) => {
                const priceA = parseFloat(a.context?.custom?.price || a.context?.price || 0);
                const priceB = parseFloat(b.context?.custom?.price || b.context?.price || 0);
                return priceB - priceA;
            });
            break;
        case 'date-newest':
            sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
        case 'date-oldest':
            sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            break;
    }
    
    return sorted;
}

function displayProducts(products, fromCache = false, useDefaultCategory = false) {
    if (products.length === 0) {
        gallery.innerHTML = '';
        noResultsElement.style.display = 'block';
        
        // Show appropriate message based on filters
        if (useDefaultCategory) {
            searchInfo.textContent = `No ${DEFAULT_CATEGORY} products found`;
        } else if (searchInput.value.trim() || categoryFilter.value) {
            searchInfo.textContent = 'No products found matching your criteria';
        } else {
            searchInfo.textContent = 'No products available';
        }
        
        updateStatistics([]);
        return;
    }
    
    noResultsElement.style.display = 'none';

    // Update search info with default category context
    const searchTerm = searchInput.value.trim();
    
    if (searchTerm || categoryFilter.value) {
        let info = `Showing ${products.length} of ${allProducts.length} products`;
        if (searchTerm) info += ` matching "${searchTerm}"`;
        if (categoryFilter.value) info += ` in ${categoryFilter.value}`;
        
        searchInfo.textContent = info;
    } else if (useDefaultCategory) {
        // Special message for default category
        searchInfo.textContent = `Showing ${products.length} ${DEFAULT_CATEGORY.toLowerCase()} products`;
    } else {
        searchInfo.textContent = `Showing ${products.length} products`;
    }
    
    // Apply sorting
    const sortedProducts = sortProducts(products, sortBy.value);
    
    // Generate HTML
    gallery.innerHTML = sortedProducts.map(createProductCard).join('');
    
    // Update statistics
    updateStatistics(products);
    
    // Add cache indicator
    if (fromCache) {
        const cacheNote = document.createElement('div');
        cacheNote.className = 'cache-notice';
        cacheNote.innerHTML = `
            <div style="text-align: center; padding: 10px; background: #fef3c7; border-radius: 8px; margin: 10px 0;">
                <i class="fas fa-database"></i> Showing cached data from ${formatTimeAgo(lastLoadTime)}
                <button onclick="loadProducts(true)" style="margin-left: 10px; padding: 4px 8px; background: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-sync"></i> Refresh
                </button>
            </div>
        `;
        gallery.insertBefore(cacheNote, gallery.firstChild);
    }
}

function saveToCache(data) {
    try {
        const cache = {
            timestamp: new Date().getTime(),
            data: data,
            loadTime: new Date().toISOString()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        console.log('✅ Data saved to cache');
    } catch (e) {
        console.warn('⚠️ Could not save to cache:', e.message);
    }
}

function loadFromCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        
        const cache = JSON.parse(cached);
        const now = new Date().getTime();
        
        if (now - cache.timestamp < CACHE_DURATION) {
            return cache.data;
        }
    } catch (e) {
        console.warn('⚠️ Error loading from cache:', e.message);
    }
    return null;
}

// Main load function
async function loadProducts(forceRefresh = false) {
    if (!forceRefresh) {
        loadingElement.style.display = 'block';
        gallery.innerHTML = '';
    }
    
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing';
    
    try {
        let data;
        let fromCache = false;
        
        // Try cache first (unless forcing refresh)
        if (!forceRefresh) {
            data = loadFromCache();
            if (data) {
                console.log('📦 Loading from cache');
                fromCache = true;
                allProducts = data.resources || [];
                categories = extractCategories(allProducts);
                populateCategoryFilter(categories);
                
                console.log(`📋 Available categories:`, Array.from(categories));
                
                // On initial load, ALWAYS filter by DEFAULT_CATEGORY, even if it's not in the dropdown
                let filteredProducts;
                let isUsingDefaultCategory = false;
                
                if (useDefaultCategory && categoryFilter.value === '') {
                    // If category filter is empty and we should use default category
                    console.log(`🎯 Forcing default category filter: "${DEFAULT_CATEGORY}"`);
                    filteredProducts = filterProducts(searchInput.value, '', true);
                    isUsingDefaultCategory = true;
                } else {
                    // Use whatever is in the category filter
                    filteredProducts = filterProducts(searchInput.value, categoryFilter.value);
                }
                
                displayProducts(filteredProducts, true, isUsingDefaultCategory);
                
                lastLoadTime = data.loadTime;
                lastUpdatedElement.textContent = formatDate(lastLoadTime);
                updateInfo.textContent = `Last updated: ${formatTimeAgo(lastLoadTime)}`;
                
                loadingElement.style.display = 'none';
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
                
                // Still fetch fresh data in background
                setTimeout(() => fetchFreshData(false), 1000);
                return;
            }
        }
        
        // Fetch from GitHub Pages
        console.log('🌐 Fetching fresh data from GitHub Pages');
        const timestamp = forceRefresh ? new Date().getTime() : '';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const res = await fetch(`${PRODUCTS_JSON_URL}?v=${timestamp}`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        data = await res.json();
        
        if (!data.resources || !Array.isArray(data.resources)) {
            throw new Error('Invalid data format: missing resources array');
        }
        
        // Process data
        allProducts = data.resources;
        categories = extractCategories(allProducts);
        
        console.log(`📊 Found ${allProducts.length} total products`);
        console.log(`📋 Available categories:`, Array.from(categories));
        
        // Save to cache
        saveToCache({
            resources: allProducts,
            loadTime: new Date().toISOString()
        });
        
        // Set up category filter
        populateCategoryFilter(categories);
        
        // On initial load, ALWAYS filter by DEFAULT_CATEGORY
        let filteredProducts;
        let isUsingDefaultCategory = false;
        
        if (useDefaultCategory && categoryFilter.value === '') {
            // If category filter is empty and we should use default category
            console.log(`🎯 Forcing default category filter: "${DEFAULT_CATEGORY}"`);
            filteredProducts = filterProducts(searchInput.value, '', true);
            isUsingDefaultCategory = true;
        } else {
            // Use whatever is in the category filter
            filteredProducts = filterProducts(searchInput.value, categoryFilter.value);
        }
        
        displayProducts(filteredProducts, false, isUsingDefaultCategory);
        
        // Update UI
        lastLoadTime = new Date().toISOString();
        lastUpdatedElement.textContent = formatDate(lastLoadTime);
        updateInfo.textContent = `Last updated: Just now`;
        updateInfo.style.color = '#10b981';
        
        // Log what's being shown
        if (isUsingDefaultCategory) {
            console.log(`✅ Loaded ${allProducts.length} products, showing ${filteredProducts.length} ${DEFAULT_CATEGORY} products`);
        } else if (categoryFilter.value) {
            console.log(`✅ Loaded ${allProducts.length} products, showing ${filteredProducts.length} products in "${categoryFilter.value}" category`);
        } else {
            console.log(`✅ Loaded ${allProducts.length} products, showing ${filteredProducts.length} products`);
        }
        
        retryCount = 0; // Reset retry counter on success
        
    } catch (error) {
        console.error('❌ Error loading products:', error);
        
        // Retry logic
        if (retryCount < MAX_RETRIES && !forceRefresh) {
            retryCount++;
            console.log(`🔄 Retrying... (${retryCount}/${MAX_RETRIES})`);
            
            gallery.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                    <div style="font-size: 4rem; color: #f59e0b; margin-bottom: 1rem;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>Connection Issue</h3>
                    <p>${error.message}</p>
                    <p>Retrying in ${RETRY_DELAY/1000} seconds...</p>
                    <div class="retry-progress" style="width: 100%; height: 4px; background: #e5e7eb; border-radius: 2px; margin-top: 1rem; overflow: hidden;">
                        <div id="retry-progress-bar" style="height: 100%; background: #f59e0b; width: 0%; transition: width ${RETRY_DELAY/1000}s linear;"></div>
                    </div>
                </div>
            `;
            
            // Animate progress bar
            setTimeout(() => {
                document.getElementById('retry-progress-bar').style.width = '100%';
            }, 10);
            
            // Retry after delay
            setTimeout(() => loadProducts(forceRefresh), RETRY_DELAY);
            return;
        }
        
        // Show error message
        gallery.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #dc2626;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <h3>Failed to load products</h3>
                <p>${error.message}</p>
                <p><small>Check if the products.json file exists on GitHub Pages</small></p>
                <div style="margin-top: 2rem;">
                    <button onclick="loadProducts(true)" class="retry-btn" style="padding: 10px 20px; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer; margin-right: 10px;">
                        <i class="fas fa-redo"></i> Try Again
                    </button>
                </div>
            </div>
        `;
        
    } finally {
        loadingElement.style.display = 'none';
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
    }
}

async function fetchFreshData(showNotification = true) {
    try {
        const res = await fetch(`${PRODUCTS_JSON_URL}?v=${Date.now()}`);
        if (res.ok) {
            const data = await res.json();
            if (data.resources && Array.isArray(data.resources)) {
                // Check if data changed
                const oldCount = allProducts.length;
                const newCount = data.resources.length;
                
                if (oldCount !== newCount || JSON.stringify(allProducts) !== JSON.stringify(data.resources)) {
                    // Update data
                    allProducts = data.resources;
                    categories = extractCategories(allProducts);
                    populateCategoryFilter(categories);
                    
                    saveToCache({
                        resources: allProducts,
                        loadTime: new Date().toISOString()
                    });
                    
                    // Don't force default category on background updates
                    const filteredProducts = filterProducts(searchInput.value, categoryFilter.value);
                    displayProducts(filteredProducts, false, false);
                    
                    lastLoadTime = new Date().toISOString();
                    lastUpdatedElement.textContent = formatDate(lastLoadTime);
                    updateInfo.textContent = `Updated: ${formatTimeAgo(lastLoadTime)}`;
                    
                    if (showNotification) {
                        showNotificationMessage('Products updated in background', 'success');
                    }
                    
                    console.log('🔄 Background update completed');
                }
            }
        }
    } catch (error) {
        console.log('Background update failed:', error.message);
    }
}

function showNotificationMessage(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = `
        <div style="position: fixed; top: 20px; right: 20px; padding: 15px 20px; background: ${type === 'success' ? '#10b981' : '#3b82f6'}; color: white; border-radius: 8px; z-index: 1000; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); animation: slideIn 0.3s;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function shareProduct(name, url) {
    if (navigator.share) {
        navigator.share({
            title: name,
            text: `Check out ${name} from JOH Technologies`,
            url: url
        });
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(`${name}: ${url}`).then(() => {
            showNotificationMessage('Link copied to clipboard', 'success');
        });
    }
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize the application
function init() {
    // Set useDefaultCategory to true for initial load
    useDefaultCategory = true;
    
    // Load products on page load with default category
    loadProducts();
    
    // Search input listener
    searchInput.addEventListener('input', debounce(() => {
        // When user searches, stop using default category
        useDefaultCategory = false;
        const filteredProducts = filterProducts(searchInput.value, categoryFilter.value);
        displayProducts(filteredProducts, false, false);
    }, 300));
    
    // Category filter listener
    categoryFilter.addEventListener('change', () => {
        // When user changes category, stop using default category
        useDefaultCategory = false;
        const filteredProducts = filterProducts(searchInput.value, categoryFilter.value);
        displayProducts(filteredProducts, false, false);
    });
    
    // Sort by listener
    sortBy.addEventListener('change', () => {
        const filteredProducts = filterProducts(searchInput.value, categoryFilter.value);
        displayProducts(filteredProducts, false, false);
    });
    
    // Refresh button
    refreshBtn.addEventListener('click', () => {
        loadProducts(true);
    });
    
    // Auto-refresh every 30 minutes
    setInterval(() => fetchFreshData(true), 30 * 60 * 1000);
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            loadProducts(true);
        }
        if (e.key === 'Escape') {
            searchInput.value = '';
            // Reset to default category
            useDefaultCategory = true;
            const filteredProducts = filterProducts('', '', true);
            displayProducts(filteredProducts, false, true);
        }
    });
}

// Mobile menu toggle
function toggleMobileNav() {
    const mobileNav = document.getElementById('mobile-nav');
    if (mobileNav) {
        mobileNav.classList.toggle('active');
    }
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Export functions for use in console
window.app = {
    loadProducts,
    shareProduct,
    getStats: () => ({
        total: allProducts.length,
        categories: categories.size,
        lastUpdated: lastLoadTime,
        defaultCategory: DEFAULT_CATEGORY,
        useDefaultCategory: useDefaultCategory
    }),
    // Add a function to manually trigger default category
    showDefaultCategory: () => {
        useDefaultCategory = true;
        const filteredProducts = filterProducts('', '', true);
        displayProducts(filteredProducts, false, true);
    }
};