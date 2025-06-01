// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startAnalysis') {
    analyzeCarListings().catch(error => {
      console.error('Analysis failed:', error);
      chrome.runtime.sendMessage({ 
        type: 'error',
        error: error.message || 'Bilinmeyen bir hata oluştu'
      });
    });
  }
  return true;
});

async function analyzeCarListings() {
  console.log('Starting car analysis...');
  const analyzedCars = [];
  let count = 0;
  let currentPage = 1;
  let totalPages = 1;

  try {
    // Get total pages
    const paginationText = document.querySelector('.mbdef')?.textContent || '';
    console.log('Pagination text:', paginationText);
    
    const totalResultsMatch = paginationText.match(/toplam ([\d,]+) ilan/);
    if (totalResultsMatch) {
      const totalResults = parseInt(totalResultsMatch[1].replace(',', ''));
      totalPages = Math.ceil(totalResults / 20); // 20 results per page
      console.log(`Found ${totalResults} total results across ${totalPages} pages`);
    } else {
      console.warn('Could not find total results count');
    }

    while (currentPage <= totalPages) {
      // Get all car links from the current page
      const carRows = document.querySelectorAll('tr.searchResultsItem');
      console.log(`Found ${carRows.length} cars on page ${currentPage}`);

      const carLinks = Array.from(carRows).map(tr => {
        const link = tr.querySelector('a.classifiedTitle');
        if (!link) {
          console.warn('Could not find title link in row:', tr);
          return null;
        }
        return {
          url: link.href,
          title: link.textContent.trim(),
          listingData: extractListingData(tr)
        };
      }).filter(Boolean); // Remove null entries

      if (carLinks.length === 0) {
        throw new Error('Sayfada araç ilanı bulunamadı. Sayfa yapısı değişmiş olabilir.');
      }

      // Process each car link
      for (const carData of carLinks) {
        try {
          console.log('Processing car:', carData.title);
          
          // Open link in new tab
          const tab = await chrome.tabs.create({ url: carData.url, active: false });
          console.log('Opened tab:', tab.id);
          
          // Wait 1 second before processing
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Get car details from the new tab
          const carDetails = await getCarDetails(tab.id);
          if (!carDetails) {
            console.warn('Could not get details for car:', carData.title);
            continue;
          }
          
          console.log('Got details for car:', carData.title, carDetails);
          
          const combinedData = {
            ...carData.listingData,
            ...carDetails,
            url: carData.url,
            title: carData.title,
            scores: calculateScores(carDetails, carData.listingData)
          };
          analyzedCars.push(combinedData);
          
          // Close the tab
          await chrome.tabs.remove(tab.id);
          console.log('Closed tab:', tab.id);
          
          // Update progress
          count++;
          chrome.runtime.sendMessage({ 
            type: 'progress', 
            count,
            currentPage,
            totalPages
          });
        } catch (error) {
          console.error('Error analyzing car:', carData, error);
        }
      }

      // Go to next page if available
      if (currentPage < totalPages) {
        currentPage++;
        const nextPageUrl = new URL(window.location.href);
        const currentOffset = nextPageUrl.searchParams.get('pagingOffset') || 0;
        nextPageUrl.searchParams.set('pagingOffset', (currentPage - 1) * 20);
        
        console.log('Navigating to next page:', nextPageUrl.toString());
        
        // Navigate to next page
        window.location.href = nextPageUrl.toString();
        
        // Wait for page load
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        break;
      }
    }

    console.log('Analysis complete:', analyzedCars);
    
    // Send complete results
    chrome.runtime.sendMessage({ 
      type: 'complete',
      cars: analyzedCars
    });

  } catch (error) {
    console.error('Error during analysis:', error);
    throw error; // Re-throw to be caught by the top-level handler
  }
}

function extractListingData(tr) {
  try {
    const data = {
      price: tr.querySelector('.searchResultsPriceValue')?.textContent.trim(),
      year: tr.querySelector('td:nth-child(6)')?.textContent.trim(),
      km: tr.querySelector('td:nth-child(7)')?.textContent.trim(),
      location: tr.querySelector('.searchResultsLocationValue')?.textContent.trim()
    };
    
    console.log('Extracted listing data:', data);
    return data;
  } catch (error) {
    console.error('Error extracting listing data:', error);
    return {};
  }
}

async function getCarDetails(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.executeScript(tabId, {
      code: `
        try {
          const details = {
            price: document.querySelector('.classified-price-wrapper')?.textContent.trim(),
            year: document.querySelector('.classifiedInfoList li:contains("Yıl") span')?.textContent.trim(),
            km: document.querySelector('.classifiedInfoList li:contains("KM") span')?.textContent.trim(),
            fuelType: document.querySelector('.classifiedInfoList li:contains("Yakıt") span')?.textContent.trim(),
            transmission: document.querySelector('.classifiedInfoList li:contains("Vites") span')?.textContent.trim(),
            enginePower: document.querySelector('.classifiedInfoList li:contains("Motor Gücü") span')?.textContent.trim(),
            engineSize: document.querySelector('.classifiedInfoList li:contains("Motor Hacmi") span')?.textContent.trim(),
            damage: document.querySelector('.classifiedInfoList li:contains("Hasar") span')?.textContent.trim(),
            warranty: document.querySelector('.classifiedInfoList li:contains("Garanti") span')?.textContent.trim(),
            exchange: document.querySelector('.classifiedInfoList li:contains("Takas") span')?.textContent.trim(),
            color: document.querySelector('.classifiedInfoList li:contains("Renk") span')?.textContent.trim(),
            description: document.querySelector('.classifiedDescription')?.textContent.trim()
          };
          console.log('Extracted car details:', details);
          return details;
        } catch (error) {
          console.error('Error extracting car details:', error);
          return null;
        }
      `
    }, (results) => {
      if (results && results[0]) {
        resolve(results[0]);
      } else {
        console.warn('No results from executeScript');
        resolve(null);
      }
    });
  });
}

function calculateScores(details, listingData) {
  try {
    const scores = {
      overall: 100,
      value: 100,
      condition: 100
    };
    
    // Parse numeric values
    const price = parseFloat(details.price?.replace(/[^0-9]/g, '')) || 0;
    const year = parseInt(details.year) || 0;
    const km = parseInt(details.km?.replace(/[^0-9]/g, '')) || 0;
    const enginePower = parseInt(details.enginePower?.match(/(\d+)/)?.[1]) || 0;
    
    console.log('Calculating scores for:', {
      price,
      year,
      km,
      enginePower
    });
    
    // Value Score (price vs features)
    scores.value = 100;
    scores.value -= (price / 10000); // Price penalty
    scores.value += (enginePower / 5); // Power bonus
    scores.value += (year - 2015) * 3; // Newer year bonus
    
    // Condition Score
    scores.condition = 100;
    scores.condition -= (km / 1000); // Kilometer penalty
    if (details.damage?.toLowerCase().includes('var')) {
      scores.condition -= 40;
    }
    if (details.warranty?.toLowerCase().includes('var')) {
      scores.condition += 10;
    }
    
    // Overall Score (weighted average)
    scores.overall = (
      scores.value * 0.4 + // 40% value weight
      scores.condition * 0.6 // 60% condition weight
    );
    
    // Normalize scores to 0-100 range
    Object.keys(scores).forEach(key => {
      scores[key] = Math.max(0, Math.min(100, scores[key]));
    });
    
    console.log('Calculated scores:', scores);
    return scores;
  } catch (error) {
    console.error('Error calculating scores:', error);
    return {
      overall: 0,
      value: 0,
      condition: 0
    };
  }
} 