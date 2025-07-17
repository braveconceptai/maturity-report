// server.js - Railway Web Service for PDF Generation
const express = require('express');
const puppeteer = require('puppeteer-core');
// —–– MAILGUN V3 CLIENT —––––
const mailgun = require('./mailgunClient');
const chromium = require('@sparticuz/chromium');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced middleware configuration for Railway + Zapier
app.use(express.json({ 
  limit: '10mb',
  type: ['application/json', 'application/*+json'],
  verify: (req, res, buf) => {
    req.rawBody = buf; // Store raw body for debugging
  }
}));

app.use(express.urlencoded({ 
  extended: true,
  limit: '10mb',
  type: 'application/x-www-form-urlencoded'
}));

// Debugging middleware for webhooks
app.use('/generate-report', (req, res, next) => {
  console.log('🔍 Request Headers:', req.headers);
  console.log('🔍 Content-Type:', req.get('Content-Type'));
  console.log('🔍 Request Method:', req.method);
  
  // Log first 500 chars of raw body if available
  if (req.rawBody) {
    console.log('🔍 Raw body preview:', req.rawBody.toString().substring(0, 500));
  }
  
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'AI Maturity Report Service Running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: 'GET /',
      generateReport: 'POST /generate-report'
    }
  });
});

// COMPLETE UPDATED GENERATE REPORT ENDPOINT
app.post('/generate-report', async (req, res) => {
  console.log('🚀 Starting AI Maturity Report generation...');
  
  try {
    // DEBUG: Log the full request body
    console.log('🔍 DEBUG: Full req.body:', JSON.stringify(req.body, null, 2));
    
    // FIX: Handle Zapier's stringified JSON format
    let parsedBody;
    if (req.body[""] && typeof req.body[""] === 'string') {
      // Zapier sent JSON as a string in empty key
      console.log('🔧 Parsing Zapier stringified JSON...');
      parsedBody = JSON.parse(req.body[""]);
    } else {
      // Normal JSON object
      parsedBody = req.body;
    }
    
    console.log('🔍 DEBUG: Parsed body:', JSON.stringify(parsedBody, null, 2));
    
    const { 
  clientName,
  companyName, 
  industry,
  reportId,
  assessmentDate,
  recipientEmail,
  scores,
  // NEW FIELDS FOR COMPREHENSIVE MAPPING
  perceivedMaturity,
  perceivedMaturityLevel,
  overallMaturityLevel,
  overallMaturityDescription,
  strongestArea,
  growthOpportunity,
  strategyLevel,
  peopleLevel,
  toolsLevel,
  dataLevel,
  ethicsLevel,
  // EXISTING FIELDS
  aiPoweredAnalysis,
  tailoredRecommendations,
  topOpportunities,
  topChallenges
} = parsedBody;

console.log('🔍 DEBUG: Received scores:', scores);
console.log('🔍 DEBUG: Additional fields:', {
  perceivedMaturity,
  perceivedMaturityLevel,
  overallMaturityLevel,
  strongestArea,
  growthOpportunity
});

// Enhanced validation - Check scores object structure
if (!clientName || !companyName || !recipientEmail || !scores || 
    typeof scores !== 'object' || 
    typeof scores.strategy !== 'number' || scores.strategy === 0 ||
    typeof scores.tools !== 'number' || 
    typeof scores.people !== 'number' || 
    typeof scores.data !== 'number' || 
    typeof scores.ethics !== 'number') {
  console.log('❌ Validation failed:', { 
    clientName: !!clientName, 
    companyName: !!companyName, 
    recipientEmail: !!recipientEmail, 
    scores: scores,
    scoresType: typeof scores
  });
  return res.status(400).json({ 
    error: 'Missing required fields or invalid scores structure',
    received: { 
      clientName: !!clientName, 
      companyName: !!companyName, 
      recipientEmail: !!recipientEmail, 
      scores: scores 
    }
  });
}

    console.log('✅ Validation passed!');

    // Generate PDF with ALL fields
    const pdfBuffer = await generatePDF({
      clientName,
      companyName,
      industry: industry || 'Professional Services',
      reportId: reportId || `BC-2025-${Date.now()}`,
      assessmentDate: assessmentDate || new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      scores,
      // NEW COMPREHENSIVE FIELDS
      perceivedMaturity: perceivedMaturity || Math.round((scores.strategy + scores.tools + scores.people + scores.data + scores.ethics) / 5),
      perceivedMaturityLevel: perceivedMaturityLevel || getMaturityLevel(Math.round((scores.strategy + scores.tools + scores.people + scores.data + scores.ethics) / 5)),
      overallMaturityLevel: overallMaturityLevel || Math.round((scores.strategy + scores.tools + scores.people + scores.data + scores.ethics) / 5),
      overallMaturityDescription: overallMaturityDescription || getMaturityLevel(Math.round((scores.strategy + scores.tools + scores.people + scores.data + scores.ethics) / 5)),
      strongestArea: strongestArea || getStrongestArea(scores),
      growthOpportunity: growthOpportunity || getWeakestArea(scores),
      strategyLevel: strategyLevel || getMaturityLevel(scores.strategy),
      peopleLevel: peopleLevel || getMaturityLevel(scores.people),
      toolsLevel: toolsLevel || getMaturityLevel(scores.tools),
      dataLevel: dataLevel || getMaturityLevel(scores.data),
      ethicsLevel: ethicsLevel || getMaturityLevel(scores.ethics),
      // EXISTING FIELDS WITH FALLBACKS
      aiPoweredAnalysis: aiPoweredAnalysis || 'Your organization shows strong potential for AI advancement with strategic implementation.',
      tailoredRecommendations: tailoredRecommendations || [
        'Focus on building your data foundation first',
        'Start with pilot projects in high-impact areas', 
        'Develop clear AI governance frameworks'
      ],
      topOpportunities: topOpportunities || 'Process automation and decision support',
      topChallenges: topChallenges || 'Implementation planning and change management'
    });

    // Send email with PDF attachment
    await sendReportEmail({
      recipientEmail,
      clientName,
      companyName,
      scores,
      pdfBuffer
    });

    console.log('✅ Report generated and sent successfully');
    
    res.json({ 
      success: true, 
      message: 'AI Maturity Report generated and sent successfully',
      reportId: reportId || `BC-2025-${Date.now()}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error generating report:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate report',
      details: error.message 
    });
  }
});

// HELPER FUNCTIONS
function getMaturityLevel(score) {
  if (score <= 1) return 'Emerging';
  if (score <= 2) return 'Emerging';
  if (score <= 3) return 'Developing';
  if (score <= 4) return 'Advanced';
  return 'Leading';
}

function getStrongestArea(scores) {
  const areaNames = {
    strategy: 'Strategy & Planning',
    tools: 'Tools & Integration', 
    people: 'People & Skills',
    data: 'Data Readiness',
    ethics: 'Ethics & Governance'
  };
  const strongest = Object.entries(scores).reduce((a, b) => scores[a[0]] > scores[b[0]] ? a : b);
  return areaNames[strongest[0]];
}

function getWeakestArea(scores) {
  const areaNames = {
    strategy: 'Strategy & Planning',
    tools: 'Tools & Integration', 
    people: 'People & Skills',
    data: 'Data Readiness',
    ethics: 'Ethics & Governance'
  };
  const weakest = Object.entries(scores).reduce((a, b) => scores[a[0]] < scores[b[0]] ? a : b);
  return areaNames[weakest[0]];
}

// PDF generation function
async function generatePDF(data) {
  console.log('📄 Starting PDF generation...');
  
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();

  await page.setViewport({
    width: 1200,
    height: 1600,
    deviceScaleFactor: 2
  });

  // Generate HTML template with data injection
  const htmlContent = generateHTMLTemplate(data);

  await page.setContent(htmlContent, {
    waitUntil: 'networkidle0',
    timeout: 60000
  });

  await page.emulateMediaType('print');

  const pdf = await page.pdf({
    format: 'Letter',
    margin: {
      top: '0.5in',
      right: '0.4in',
      bottom: '0.5in',
      left: '0.4in'
    },
    printBackground: true,
    scale: 0.85,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    waitForFonts: true,
    timeout: 60000,
    omitBackground: false,
    tagged: true
  });

  await browser.close();
  console.log('✅ PDF generated successfully');
  // ── MAILGUN: send PDF attachment ──
console.log('📧 Sending PDF to', data.recipientEmail);
await mailgun.messages().send({
  from:    `Brave Concept AI Reports <reports@${process.env.MAILGUN_DOMAIN}>`,
  to:      data.recipientEmail,
  subject: `Your AI Maturity Assessment Report`,
  text:    `Hi ${data.clientName},\n\nPlease find your personalized report attached.\n\n– Brave Concept AI`,
  attachment: pdf    // <-- that’s the Buffer from page.pdf()
});
return res
  .status(200)
  .json({ success: true, message: 'Report emailed.' });
}

// UPDATED HTML template function with ALL field mappings
function generateHTMLTemplate(data) {
  const { 
    clientName, 
    companyName, 
    industry, 
    reportId, 
    assessmentDate, 
    scores,
    perceivedMaturity,
    perceivedMaturityLevel,
    overallMaturityLevel,
    overallMaturityDescription,
    strongestArea,
    growthOpportunity,
    strategyLevel,
    peopleLevel,
    toolsLevel,
    dataLevel,
    ethicsLevel,
    aiPoweredAnalysis, 
    tailoredRecommendations, 
    topOpportunities, 
    topChallenges 
  } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Maturity Assessment Report</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Roboto:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        /* UNIVERSAL RESET */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        /* BASE TYPOGRAPHY */
        html, body {
            font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
            line-height: 1.6;
            color: #333;
            background: white;
            font-size: 14pt;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        /* PAGE STRUCTURE */
        @page {
            size: Letter;
            margin: 0.5in 0.4in;
        }

        .page-1, .page-2, .page-3, .page-4, .page-5 { 
            break-after: page; 
            min-height: 9.2in;
            padding: 0.3rem 0;
        }
        
        .page-5 { 
            break-after: auto;
        }

        /* PRINT OPTIMIZATION */
        @media print {
            * {
                print-color-adjust: exact !important;
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
            
            html, body {
                font-family: 'Roboto', sans-serif !important;
                font-size: 14pt !important;
                line-height: 1.6 !important;
            }
        }

        /* COVER HEADER */
        .cover-header {
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #06b6d4 100%);
            color: white;
            padding: 1rem;
            text-align: center;
            margin-bottom: 0.6rem;
            border-radius: 8px;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
        }

        .cover-title {
            font-family: 'Montserrat', sans-serif !important;
            font-size: 1.8rem;
            font-weight: 700;
            margin-bottom: 0.3rem;
            color: white;
        }

        .cover-subtitle {
            font-family: 'Montserrat', sans-serif !important;
            font-size: 1.4rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: white;
        }

        .cover-tagline {
            font-family: 'Roboto', sans-serif !important;
            font-size: 1rem;
            font-style: italic;
            opacity: 0.95;
            color: white;
        }

        /* SECTION HEADERS */
        .section-header {
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            color: white;
            padding: 0.6rem 1rem;
            margin: 0.6rem 0 0.5rem 0;
            font-family: 'Montserrat', sans-serif !important;
            font-size: 1.1rem;
            font-weight: 600;
            border-radius: 6px;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
        }

        /* LAYOUT GRIDS */
        .two-column {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
            margin: 0.6rem 0;
        }

        .content-block {
            margin-bottom: 0.6rem;
        }

        /* SCORE DISPLAYS */
        .score-display {
            text-align: center;
            padding: 1rem;
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border: 2px solid #3b82f6;
            border-radius: 8px;
            print-color-adjust: exact;
        }

        .score-display h3 {
            font-family: 'Montserrat', sans-serif !important;
            font-size: 0.8rem;
            font-weight: 600;
            color: #1e3a8a;
            margin-bottom: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .score-large {
            font-family: 'Montserrat', sans-serif !important;
            font-size: 3rem;
            font-weight: 700;
            color: #1e3a8a;
            line-height: 1;
            margin-bottom: 0.5rem;
        }

        .score-label {
            font-family: 'Montserrat', sans-serif !important;
            font-size: 1.2rem;
            font-weight: 600;
            color: #3b82f6;
            margin-bottom: 0.5rem;
        }

        .score-description {
            font-family: 'Roboto', sans-serif !important;
            font-size: 0.9rem;
            color: #64748b;
            line-height: 1.4;
        }

        /* KEY FINDINGS */
        .key-findings-compact {
            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
            border-left: 4px solid #3b82f6;
            padding: 0.6rem;
            margin: 0.6rem 0;
            border-radius: 0 6px 6px 0;
            print-color-adjust: exact;
        }

        .key-findings-compact h3 {
            font-family: 'Montserrat', sans-serif !important;
            font-size: 1rem;
            margin-bottom: 0.5rem;
            color: #1e3a8a;
        }

        .key-findings-compact p {
            font-family: 'Roboto', sans-serif !important;
            font-size: 0.9rem;
            color: #374151;
        }

        /* CAPABILITY GRID */
        .capability-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.8rem;
            margin: 0.6rem 0;
        }

        .capability-box {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            padding: 1rem;
            text-align: center;
            print-color-adjust: exact;
            min-height: 150px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }

        .capability-box:nth-child(1) { grid-column: 1; grid-row: 1; }
        .capability-box:nth-child(2) { grid-column: 2; grid-row: 1; }
        .capability-box:nth-child(3) { grid-column: 1; grid-row: 2; }
        .capability-box:nth-child(4) { grid-column: 2; grid-row: 2; }
        .capability-box:nth-child(5) { 
            grid-column: 1 / -1; 
            grid-row: 3; 
            width: 50%;
            margin: 0 auto;
        }

        .capability-score {
            font-family: 'Montserrat', sans-serif !important;
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            line-height: 1;
        }

        .capability-name {
            font-family: 'Roboto', sans-serif !important;
            font-size: 0.85rem;
            color: #64748b;
            margin-bottom: 0.5rem;
            font-weight: 500;
        }

        .capability-level {
            font-family: 'Montserrat', sans-serif !important;
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }

        /* PROGRESS BARS */
        .progress-container {
            background: #e2e8f0;
            height: 8px;
            border-radius: 4px;
            overflow: hidden;
            width: 100%;
            margin-top: auto;
        }

        .progress-bar {
            height: 100%;
            border-radius: 4px;
        }

        /* CAPABILITY COLORS */
        .strategy .capability-score,
        .strategy .capability-level { color: #1e40af !important; }
        .strategy .progress-bar { 
            background: #3b82f6 !important; 
            width: ${scores.strategy * 20}% !important;
        }

        .tools .capability-score,
        .tools .capability-level { color: #d97706 !important; }
        .tools .progress-bar { 
            background: #f59e0b !important; 
            width: ${scores.tools * 20}% !important;
        }

        .people .capability-score,
        .people .capability-level { color: #059669 !important; }
        .people .progress-bar { 
            background: #10b981 !important; 
            width: ${scores.people * 20}% !important;
        }

        .data .capability-score,
        .data .capability-level { color: #dc2626 !important; }
        .data .progress-bar { 
            background: #ef4444 !important; 
            width: ${scores.data * 20}% !important;
        }

        .ethics .capability-score,
        .ethics .capability-level { color: #7c3aed !important; }
        .ethics .progress-bar { 
            background: #8b5cf6 !important; 
            width: ${scores.ethics * 20}% !important;
        }

        /* ANALYSIS BOXES */
        .analysis-box {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border-left: 4px solid #64748b;
            padding: 0.5rem;
            margin: 0.3rem 0;
            border-radius: 0 6px 6px 0;
            print-color-adjust: exact;
        }

        .analysis-box h3 {
            font-family: 'Montserrat', sans-serif !important;
            font-size: 0.95rem;
            margin-bottom: 0.3rem;
            font-weight: 600;
        }

        .analysis-box p {
            font-family: 'Roboto', sans-serif !important;
            font-size: 0.85rem;
            line-height: 1.4;
            margin-bottom: 0.3rem;
            color: #374151;
        }

        .analysis-box .research-quote {
            font-style: italic;
            color: #64748b;
            font-size: 0.7rem;
            margin-top: 0.2rem;
            padding: 0.3rem;
            background: rgba(148, 163, 184, 0.1);
            border-radius: 3px;
        }

        .analysis-box.strategy { border-left-color: #3b82f6; }
        .analysis-box.people { border-left-color: #10b981; }
        .analysis-box.tools { border-left-color: #f59e0b; }
        .analysis-box.data { border-left-color: #ef4444; }
        .analysis-box.ethics { border-left-color: #8b5cf6; }

        /* INSIGHTS SECTIONS */
        .insights-section {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            padding: 0.8rem;
            margin: 0.6rem 0;
            border-radius: 8px;
            border-left: 4px solid #1e3a8a;
            print-color-adjust: exact;
        }

        .insights-section h3 {
            font-family: 'Montserrat', sans-serif !important;
            color: #1e3a8a;
            margin-bottom: 0.6rem;
            font-size: 1rem;
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 0.3rem;
            font-weight: 600;
        }

        .insights-section p {
            font-family: 'Roboto', sans-serif !important;
            font-size: 0.9rem;
            line-height: 1.5;
            margin-bottom: 0.5rem;
            color: #374151;
        }

        /* CTA SECTION */
        .cta-section-unified {
            background: linear-gradient(135deg, #3b82f6 0%, #1e3a8a 50%, #06b6d4 100%);
            color: white;
            padding: 2rem;
            text-align: center;
            border-radius: 8px;
            margin: 1.5rem 0;
            print-color-adjust: exact;
        }

        .cta-section-unified h2 {
            font-family: 'Montserrat', sans-serif !important;
            font-size: 1.5rem;
            margin-bottom: 1rem;
            color: white;
        }

        .cta-section-unified p {
            font-family: 'Roboto', sans-serif !important;
            font-size: 1rem;
            color: white;
            margin-bottom: 0.8rem;
        }

        .cta-button {
            background: white;
            color: #1e3a8a;
            padding: 0.8rem 1.5rem;
            border-radius: 6px;
            font-family: 'Montserrat', sans-serif !important;
            font-size: 1rem;
            font-weight: 600;
            display: inline-block;
            margin: 0.8rem 0;
            text-decoration: none;
        }

        .cta-list {
            text-align: left;
            max-width: 500px;
            margin: 1rem auto;
        }

        .cta-list ul {
            margin-left: 1.5rem;
        }

        .cta-list li {
            font-family: 'Roboto', sans-serif !important;
            font-size: 0.95rem;
            color: white;
            margin-bottom: 0.5rem;
        }

        /* CONTACT SECTION */
        .contact-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
            margin: 1rem 0;
        }

        .contact-box {
            text-align: center;
            padding: 1rem;
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border-radius: 8px;
            border: 2px solid #e2e8f0;
        }

        .contact-box p {
            font-family: 'Roboto', sans-serif !important;
            font-size: 0.95rem;
            margin-bottom: 0.6rem;
        }

        /* TYPOGRAPHY */
        p {
            font-family: 'Roboto', sans-serif !important;
            margin-bottom: 0.4rem;
            line-height: 1.5;
            font-size: 14pt;
        }

        h3 {
            font-family: 'Montserrat', sans-serif !important;
            font-size: 1rem;
            margin-bottom: 0.4rem;
            font-weight: 600;
        }

        strong {
            font-weight: 600;
        }

        ul {
            margin-left: 1.5rem;
            margin-top: 0.5rem;
        }

        li {
            margin-bottom: 0.4rem;
            font-family: 'Roboto', sans-serif !important;
            font-size: 0.95rem;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <!-- PAGE 1: COVER + REPORT DETAILS + AI MATURITY SNAPSHOT + KEY FINDINGS -->
    <div class="page-1">
        <div class="cover-header">
            <h1 class="cover-title">BRAVE CONCEPT AI</h1>
            <h2 class="cover-subtitle">AI MATURITY ASSESSMENT REPORT</h2>
            <p class="cover-tagline">Bold Ideas. Human Roots. Ethical By Design.</p>
        </div>
        
        <div class="section-header">📋 Report Details</div>
        
        <div class="two-column content-block">
            <div>
                <p><strong>Prepared for:</strong><br>${clientName}</p>
                <p><strong>Company:</strong><br>${companyName}</p>
                <p><strong>Report ID:</strong><br>${reportId}</p>
            </div>
            <div>
                <p><strong>Industry:</strong><br>${industry}</p>
                <p><strong>Assessment Date:</strong><br>${assessmentDate}</p>
            </div>
        </div>

        <div class="section-header">📈 Your AI Maturity Snapshot</div>
        
        <div class="two-column content-block">
            <div class="score-display">
                <h3>YOUR PERCEIVED AI MATURITY</h3>
                <div class="score-large">${perceivedMaturity}</div>
                <div class="score-label">${perceivedMaturityLevel}</div>
                <p class="score-description">Your team believes you're making meaningful progress in AI adoption.</p>
            </div>
            <div class="score-display">
                <h3>DATA-DRIVEN ASSESSMENT</h3>
                <div class="score-large">${overallMaturityLevel}</div>
                <div class="score-label">${overallMaturityDescription}</div>
                <p class="score-description">Your assessment reveals solid foundations with clear pathways for ethical advancement.</p>
            </div>
        </div>
        
        <div class="key-findings-compact content-block">
            <h3>Key Findings</h3>
            <p><strong>Strongest Area:</strong> ${strongestArea} | <strong>Growth Opportunity:</strong> ${growthOpportunity} | <strong>Current Phase:</strong> ${overallMaturityDescription}</p>
        </div>
    </div>

    <!-- PAGE 2: AI CAPABILITY PROFILE -->
    <div class="page-2">
        <div class="section-header">📊 Your AI Capability Profile</div>
        
        <div class="capability-grid content-block">
            <div class="capability-box strategy">
                <div class="capability-score">${scores.strategy}/5</div>
                <div class="capability-name">🧠 Strategy & Planning</div>
                <div class="capability-level">${strategyLevel}</div>
                <div class="progress-container">
                    <div class="progress-bar strategy"></div>
                </div>
            </div>
            
            <div class="capability-box tools">
                <div class="capability-score">${scores.tools}/5</div>
                <div class="capability-name">🛠 Tools & Integration</div>
                <div class="capability-level">${toolsLevel}</div>
                <div class="progress-container">
                    <div class="progress-bar tools"></div>
                </div>
            </div>
            
            <div class="capability-box people">
                <div class="capability-score">${scores.people}/5</div>
                <div class="capability-name">👥 People & Skills</div>
                <div class="capability-level">${peopleLevel}</div>
                <div class="progress-container">
                    <div class="progress-bar people"></div>
                </div>
            </div>
            
            <div class="capability-box data">
                <div class="capability-score">${scores.data}/5</div>
                <div class="capability-name">📊 Data Readiness</div>
                <div class="capability-level">${dataLevel}</div>
                <div class="progress-container">
                    <div class="progress-bar data"></div>
                </div>
            </div>
            
            <div class="capability-box ethics">
                <div class="capability-score">${scores.ethics}/5</div>
                <div class="capability-name">🧭 Ethics & Governance</div>
                <div class="capability-level">${ethicsLevel}</div>
                <div class="progress-container">
                    <div class="progress-bar ethics"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- PAGE 3: DETAILED SCORE ANALYSIS -->
    <div class="page-3">
        <div class="section-header">🔍 Detailed Score Analysis</div>
        
        <div class="analysis-box strategy">
            <h3>🧠 Strategy & Planning: ${scores.strategy}/5 – ${strategyLevel}</h3>
            <p>At the ${strategyLevel} stage, your organization is actively working to integrate AI into core business objectives and strategic planning processes.</p>
            <div class="research-quote">Research shows 39% of companies are in emerging phase, 31% developing, 22% expanding, and only 1% achieve strategic maturity. [McKinsey 2024]</div>
        </div>

        <div class="analysis-box people">
            <h3>👥 People & Skills: ${scores.people}/5 – ${peopleLevel}</h3>
            <p>Your workforce exhibits ${peopleLevel} AI capability, indicating how prepared your team is to leverage AI tools effectively.</p>
            <div class="research-quote">70% of business leaders report skills gaps limiting growth, with only 12% of IT professionals actually possessing AI skills despite widespread adoption. [Springboard 2024, Deloitte 2024]</div>
        </div>

        <div class="analysis-box tools">
            <h3>🛠 Tools & Integration: ${scores.tools}/5 – ${toolsLevel}</h3>
            <p>Your technical infrastructure rates as ${toolsLevel} for AI implementation. This evaluates not just the tools you've adopted, but how seamlessly they work together.</p>
            <div class="research-quote">Only 22% of organizations have architecture ready to support AI workloads, despite 65% using AI regularly. Just 1% achieve mature integration. [Databricks 2024, McKinsey 2024]</div>
        </div>

        <div class="analysis-box data">
            <h3>📊 Data Readiness: ${scores.data}/5 – ${dataLevel}</h3>
            <p>Your data foundation measures ${dataLevel} for AI applications. This critical dimension determines whether your information assets are sufficiently organized and accessible.</p>
            <div class="research-quote">96% of organizations experience data quality issues in AI projects, with only 18% having clear strategies. [Forrester/PwC 2024, McKinsey 2024]</div>
        </div>

        <div class="analysis-box ethics">
            <h3>🧭 Ethics & Governance: ${scores.ethics}/5 – ${ethicsLevel}</h3>
            <p>Your approach to responsible AI practices achieves ${ethicsLevel} maturity, encompassing policies, oversight mechanisms, and cultural practices.</p>
            <div class="research-quote">Only 18% have implemented policies, and just 21% have fully operationalized responsible AI across their organizations. [McKinsey 2024, Accenture 2024]</div>
        </div>
    </div>

    <!-- PAGE 4: PERSONALIZED INSIGHTS -->
    <div class="page-4">
        <div class="section-header">💡 Your Personalized Insights</div>
        
        <div class="insights-section content-block">
            <h3>Your AI Priorities & Challenges</h3>
            <p><strong>Based on your assessment responses, here's what you told us:</strong></p>
            <p><strong>Top Opportunities:</strong> ${topOpportunities}</p>
            <p><strong>Top Challenges:</strong> ${topChallenges}</p>
        </div>

        <div class="insights-section content-block">
            <h3>AI-Powered Analysis</h3>
            <p>${aiPoweredAnalysis}</p>
            <p>The gap between your perceived ${perceivedMaturityLevel} and actual ${overallMaturityDescription} maturity highlights opportunities to drive strategic change. Your ${peopleLevel} People & Skills rating suggests your team is ready to leverage AI tools effectively, while your ${toolsLevel} Tools & Integration score indicates clear pathways for technical improvement.</p>
        </div>

        <div class="insights-section content-block">
            <h3>Tailored Recommendations</h3>
            ${Array.isArray(tailoredRecommendations) 
              ? tailoredRecommendations.map((rec, i) => `<p><strong>${i + 1}.</strong> ${rec}</p>`).join('')
              : `<p><strong>1.</strong> Build your ethical data foundation first. Ensure HIPAA-compliant organization and security—this creates trust and enables responsible AI growth.</p>
                 <p><strong>2.</strong> Start small, think bold. Pilot cost-effective AI tools for routine tasks, allowing your team to focus on what humans do best—caring for patients.</p>
                 <p><strong>3.</strong> Develop governance that matters. Create clear AI ethics guidelines that build stakeholder confidence and ensure every innovation serves your patients first.</p>`
            }
        </div>
    </div>

    <!-- PAGE 5: CTA + CONTACT -->
    <div class="page-5">
        <div class="cta-section-unified">
            <h2>🚀 Ready to Accelerate Your AI Journey?</h2>
            <p>Your assessment reveals significant potential, but also complex challenges that require strategic navigation.</p>
            <div class="cta-button">Book Your Free 30-Minute Strategy Session</div>
            <div class="cta-list">
                <p><strong>Get personalized guidance from Brave Concept AI experts who can help you:</strong></p>
                <ul>
                    <li>Develop a clear 90-day AI implementation plan</li>
                    <li>Navigate the specific challenges you identified</li>
                    <li>Leverage your ${strongestArea} to drive quick wins</li>
                    <li>Address your ${growthOpportunity} systematically</li>
                </ul>
            </div>
        </div>

        <div style="margin-top: 1.5rem;">
            <h3 style="text-align: center; font-family: 'Montserrat', sans-serif; font-size: 1.3rem; color: #1e3a8a; margin-bottom: 1rem;">Contact Information</h3>
            <div class="contact-grid">
                <div class="contact-box">
                    <p><strong>📧 Email:</strong><br>info@braveconcept.ai</p>
                    <p><strong>🌐 Website:</strong><br>braveconcept.ai</p>
                </div>
                <div class="contact-box">
                    <p><strong>💬 AI Assistant:</strong><br>Ask BellaBot at braveconcept.ai</p>
                    <p><strong>📞 Phone:</strong><br>(802) 560-8669</p>
                </div>
            </div>
            <p style="text-align: center; margin-top: 1rem; font-style: italic; font-size: 0.9rem; color: #64748b;">Ready to get started? Schedule your complimentary consultation above.</p>
        </div>
    </div>
</body>
</html>`;
}

// Email sending function
async function sendReportEmail({ recipientEmail, clientName, companyName, scores, pdfBuffer }) {
  console.log('📧 Sending email to:', recipientEmail);
  console.log('🔍 DEBUG: Using domain:', process.env.MAILGUN_DOMAIN);
  console.log('🔍 DEBUG: API Key exists:', !!process.env.MAILGUN_API_KEY);
  console.log('🔍 DEBUG: PDF Buffer size:', pdfBuffer.length, 'bytes');
  
  const overallScore = Math.round((scores.strategy + scores.tools + scores.people + scores.data + scores.ethics) / 5);
  const getMaturityLevel = (score) => {
    if (score <= 2) return 'Emerging';
    if (score <= 3) return 'Developing'; 
    if (score <= 4) return 'Advanced';
    return 'Leading';
  };

  const strongestArea = Object.entries(scores).reduce((a, b) => scores[a[0]] > scores[b[0]] ? a : b);
  const weakestArea = Object.entries(scores).reduce((a, b) => scores[a[0]] < scores[b[0]] ? a : b);

  const areaNames = {
    strategy: 'Strategy & Planning',
    tools: 'Tools & Integration',
    people: 'People & Skills', 
    data: 'Data Readiness',
    ethics: 'Ethics & Governance'
  };

  try {
    const emailData = {
      from: 'Brave Concept AI <noreply@mg.braveconcept.ai>',
      to: recipientEmail,
      subject: `✅ Your AI Assessment Results Are Ready - ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
         <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #06b6d4 100%); color: white; padding: 2rem; text-align: center; border-radius: 8px; margin-bottom: 2rem;">
    <h1 style="margin: 0; font-size: 1.8rem; font-weight: 700; font-family: 'Montserrat', sans-serif;">BRAVE CONCEPT AI</h1>
    <h2 style="margin: 0.5rem 0; font-size: 1.4rem; font-weight: 600; font-family: 'Montserrat', sans-serif;">AI MATURITY ASSESSMENT REPORT</h2>
    <p style="margin: 0.5rem 0 0 0; opacity: 0.9; font-style: italic; font-family: 'Roboto', sans-serif;">Bold Ideas. Human Roots. Ethical By Design.</p>
    </div>
          
          <p style="font-size: 1.1rem; margin-bottom: 1.5rem;">Hi ${clientName},</p>
          
          <p>🎉 Your AI Maturity Assessment is complete! Here are your key insights:</p>
          
          <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 1.5rem; margin: 1.5rem 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0;"><strong>📊 Your AI Maturity Level:</strong> ${overallScore}/5 - ${getMaturityLevel(overallScore)}</p>
            <p style="margin: 0.5rem 0;"><strong>🎯 Strongest Area:</strong> ${areaNames[strongestArea[0]]}</p>
            <p style="margin: 0;"><strong>⚡ Growth Opportunity:</strong> ${areaNames[weakestArea[0]]}</p>
          </div>
          
          <p><strong>📄 Download your complete 5-page personalized report (attached) for:</strong></p>
          <ul style="margin-left: 1.5rem;">
            <li>✅ Detailed capability analysis</li>
            <li>✅ Industry benchmarks</li>
            <li>✅ Tailored recommendations</li>
            <li>✅ 90-day action plan</li>
          </ul>
          
          <div style="text-align: center; margin: 2rem 0;">
            <a href="https://calendly.com/tony-braveconcept/30min" style="background: #3b82f6; color: white; padding: 1rem 2rem; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">🗓️ Schedule Your FREE 30-Minute Strategy Session</a>
          </div>
          
          <div style="background: #f1f5f9; padding: 1.5rem; border-radius: 8px; margin: 2rem 0;">
            <p style="margin: 0;"><strong>🚀 Ready to accelerate your AI journey?</strong></p>
            <p style="margin: 0.5rem 0 0 0;">Get personalized guidance from our AI experts to develop your implementation plan and navigate the specific challenges you identified.</p>
          </div>
          
          <p>Best regards,<br>
          <strong>The Brave Concept AI Team</strong></p>
          
          <div style="border-top: 1px solid #e2e8f0; padding-top: 1rem; margin-top: 2rem; text-align: center; color: #64748b; font-size: 0.9rem;">
            <p>📧 info@braveconcept.ai | 🌐 braveconcept.ai | 📞 (802) 560-8669</p>
          </div>
        </div>
      `,
    attachment: pdfBuffer,
      'h:Reply-To': 'info@braveconcept.ai',
      'h:X-Mailgun-Variables': JSON.stringify({
        source: 'ai-assessment',
        type: 'automated-report'
      }),
      'h:List-Unsubscribe': '<mailto:unsubscribe@braveconcept.ai>',
      'h:X-Mailer': 'Brave Concept AI Assessment System'
    };

    console.log('🔍 DEBUG emailData:', JSON.stringify(emailData, null, 2));
    
    const result = await mailgun.messages().send(emailData);
    console.log('✅ Email sent successfully:', result);
    return { success: true, messageId: result.id };
    
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw error;
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Maturity Report Service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`📄 Generate report: POST http://localhost:${PORT}/generate-report`);
});

module.exports = app;
