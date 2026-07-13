/**
 * YRSF — SEO Utilities
 * Dynamic meta tag management and JSON-LD structured data.
 */

/**
 * Dynamically update page title and meta tags.
 * Creates tags if they don't exist.
 */
export function updateMetaTags({ title, description, keywords, ogTitle, ogDescription, ogImage, canonicalUrl }) {
  if (title) {
    document.title = title;
  }

  setMetaTag('description', description);
  setMetaTag('keywords', keywords);

  // Open Graph
  setMetaProperty('og:title', ogTitle || title);
  setMetaProperty('og:description', ogDescription || description);
  if (ogImage) setMetaProperty('og:image', ogImage);
  if (canonicalUrl) {
    setMetaProperty('og:url', canonicalUrl);
    setCanonical(canonicalUrl);
  }

  // Twitter Card
  setMetaTag('twitter:card', 'summary_large_image');
  setMetaTag('twitter:title', ogTitle || title);
  setMetaTag('twitter:description', ogDescription || description);
  if (ogImage) setMetaTag('twitter:image', ogImage);
}

/** Generate JSON-LD Product schema for a boat */
export function generateBoatSchema(boat, prices = [], images = []) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: boat.name,
    description: boat.short_description || boat.description,
    brand: {
      '@type': 'Brand',
      name: boat.manufacturer || 'YRSF'
    },
    category: 'Yacht Charter',
    url: `${window.location.origin}/boats/${boat.slug}`
  };

  if (images.length > 0) {
    schema.image = images.map(img => img.url);
  }

  if (prices.length > 0) {
    const sorted = [...prices].sort((a, b) => a.price - b.price);
    schema.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: sorted[0].price,
      highPrice: sorted[sorted.length - 1].price,
      offerCount: sorted.length,
      availability: 'https://schema.org/InStock'
    };
  }

  if (boat.length_ft || boat.capacity) {
    schema.additionalProperty = [];
    if (boat.length_ft) {
      schema.additionalProperty.push({
        '@type': 'PropertyValue',
        name: 'Length',
        value: `${boat.length_ft}ft`
      });
    }
    if (boat.capacity) {
      schema.additionalProperty.push({
        '@type': 'PropertyValue',
        name: 'Capacity',
        value: `${boat.capacity} guests`
      });
    }
  }

  return schema;
}

/** Inject or update JSON-LD structured data in the head */
export function injectSchema(schemaObject) {
  let script = document.querySelector('script[type="application/ld+json"][data-yrsf]');
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.yrsf = 'true';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schemaObject);
}

// --- Internal Helpers ---

function setMetaTag(name, content) {
  if (!content) return;
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setMetaProperty(property, content) {
  if (!content) return;
  let tag = document.querySelector(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(url) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}
