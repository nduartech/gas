// Fix for the duplication issue in generator.ts

// The issue is in the generateTemplateHTML function around lines 472-479
// When a child element needs a separate template, the parent template
// should only include a placeholder (<!>) instead of the full HTML

// Current problematic code:
/*
} else if (child.type === "element") {
  // Check if this element truly needs a separate template
  const needsSeparateTemplate = elementNeedsSeparateTemplate(child.value);
  if (needsSeparateTemplate) {
    html += generateHTMLWithPlaceholders(child.value, true);
  } else {
    // Include element directly in template with placeholders for its dynamic children
    html += generateHTMLWithPlaceholders(child.value, false);
  }
}
*/

// Fixed code should be:
/*
} else if (child.type === "element") {
  // Check if this element truly needs a separate template
  const needsSeparateTemplate = elementNeedsSeparateTemplate(child.value);
  if (needsSeparateTemplate) {
    // Element will have its own template - just add placeholder
    html += "<!>";
  } else {
    // Include element directly in template with placeholders for its dynamic children
    html += generateHTMLWithPlaceholders(child.value, false);
  }
}
*/

console.log("The fix is to replace generateHTMLWithPlaceholders(child.value, true) with '<!>' in generateTemplateHTML");
