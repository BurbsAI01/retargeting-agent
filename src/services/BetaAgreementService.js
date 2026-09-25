const crypto = require('crypto');

class BetaAgreementService {
  constructor(pool) {
    this.pool = pool;
  }

  async generateSignatureLink(betaCustomerId, email) {
    const signatureToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.pool.query(
      `UPDATE beta_customers
       SET signature_token = $1, signature_token_expires_at = $2
       WHERE id = $3`,
      [signatureToken, expiresAt, betaCustomerId]
    );

    const signatureLink = `${process.env.APP_URL || 'http://localhost:3000'}/beta/sign/${signatureToken}`;
    return signatureLink;
  }

  getAgreementHTML(customerName, companyName, signatureToken) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Beta Agreement - Retargeting Agent</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 3px solid #007bff;
      padding-bottom: 20px;
    }
    h1 { color: #007bff; font-size: 28px; }
    .subtitle { color: #666; font-size: 14px; margin-top: 10px; }
    .info-box {
      background: #f8f9fa;
      padding: 15px;
      border-left: 4px solid #007bff;
      margin: 20px 0;
      border-radius: 4px;
    }
    h2 { color: #2c3e50; margin-top: 30px; margin-bottom: 15px; font-size: 18px; }
    p { margin-bottom: 15px; text-align: justify; }
    ul { margin-left: 20px; margin-bottom: 15px; }
    li { margin-bottom: 10px; }
    .signature-section {
      margin-top: 50px;
      padding-top: 30px;
      border-top: 1px solid #ddd;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: 600;
      color: #2c3e50;
    }
    input[type="text"],
    input[type="email"] {
      width: 100%;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }
    button {
      background: #007bff;
      color: white;
      padding: 12px 30px;
      border: none;
      border-radius: 4px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.3s;
    }
    button:hover { background: #0056b3; }
    .footer {
      text-align: center;
      margin-top: 30px;
      font-size: 12px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>RETARGETING AGENT BETA PROGRAM</h1>
      <p class="subtitle">Customer Agreement & Terms</p>
    </div>

    <div class="info-box">
      <strong>Customer:</strong> ${customerName} / ${companyName}<br>
      <strong>Date:</strong> ${new Date().toLocaleDateString()}<br>
      <strong>Program:</strong> Retargeting Agent Beta Phase 1
    </div>

    <h2>1. Beta Access Grant</h2>
    <p>
      BurbsAI grants ${customerName} ("Customer") limited access to the Retargeting Agent platform
      in beta form. This access is provided solely for evaluation and testing purposes to demonstrate
      the platform's ability to retarget unconverted leads through multi-channel marketing.
    </p>

    <h2>2. Scope of Beta Program</h2>
    <p>
      During this beta phase, the Customer will:
    </p>
    <ul>
      <li>Integrate the Retargeting Agent tracking pixel on their website</li>
      <li>Test lead capture on their quote/service request forms</li>
      <li>Monitor retargeting campaigns through email and SMS channels</li>
      <li>Track conversion metrics and provide feedback</li>
      <li>Participate in weekly check-ins with the BurbsAI team</li>
    </ul>

    <h2>3. Confidentiality</h2>
    <p>
      Customer agrees to maintain strict confidentiality regarding any feedback, bugs, features discussed,
      or unreleased functionality discovered during the beta period. This information is proprietary to BurbsAI.
    </p>

    <h2>4. Beta Limitations</h2>
    <ul>
      <li>Beta access is non-exclusive and may be revoked at any time</li>
      <li>No guarantee of 99%+ uptime during beta phase</li>
      <li>Database and data may be reset between major releases</li>
      <li>Features, pricing, and terms are subject to change</li>
      <li>Platform is provided "AS IS" without warranties</li>
      <li>Limited to email and SMS channels during this beta phase</li>
    </ul>

    <h2>5. Feedback & Intellectual Property</h2>
    <p>
      Customer grants BurbsAI a non-exclusive, royalty-free license to use any feedback, suggestions,
      bug reports, or ideas provided during beta testing at no cost. This feedback may be used to improve
      the platform.
    </p>

    <h2>6. Data & Privacy</h2>
    <p>
      Customer data (visitor information, quotes, engagement events) is processed in accordance with
      our Privacy Policy. Customer remains the data controller for their visitor data.
    </p>

    <h2>7. Liability Limitation</h2>
    <p>
      BurbsAI provides the beta service "AS IS" without warranties of any kind. Customer uses the service
      at their own risk. BurbsAI shall not be liable for any indirect, incidental, or consequential damages.
    </p>

    <h2>8. Term & Renewal</h2>
    <p>
      This beta agreement is valid for 90 days from the signature date. After 90 days, the agreement may be
      renewed, converted to a commercial agreement, or terminated.
    </p>

    <h2>9. Termination</h2>
    <p>
      Either party may terminate this beta agreement with 7 days written notice. Upon termination,
      Customer may export their data for 30 days.
    </p>

    <div class="signature-section">
      <h2>Acceptance & Signature</h2>
      <p>
        By signing below, you acknowledge that you have read and agree to these beta program terms and conditions.
      </p>

      <form id="signatureForm">
        <div class="form-group">
          <label for="signedByName">Full Name:</label>
          <input type="text" id="signedByName" name="signedByName" required>
        </div>

        <div class="form-group">
          <label for="signedByEmail">Email Address:</label>
          <input type="email" id="signedByEmail" name="signedByEmail" required>
        </div>

        <div class="form-group">
          <label for="signedByTitle">Title/Position:</label>
          <input type="text" id="signedByTitle" name="signedByTitle" required>
        </div>

        <button type="submit">Sign & Accept Terms</button>
      </form>

      <p style="margin-top: 20px; font-size: 12px; color: #999;">
        By clicking "Sign & Accept Terms", you electronically sign this agreement.
      </p>
    </div>

    <div class="footer">
      <p>Retargeting Agent Beta Program | BurbsAI Inc. | support@retargeting.app</p>
      <p>Agreement Token: ${signatureToken}</p>
    </div>
  </div>

  <script>
    document.getElementById('signatureForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const signedByName = document.getElementById('signedByName').value;
      const signedByEmail = document.getElementById('signedByEmail').value;

      try {
        const response = await fetch('/beta/sign/${signatureToken}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signedByName, signedByEmail })
        });

        const result = await response.json();

        if (response.ok) {
          alert('✓ Agreement signed successfully!\\n\\nYour API Key:\\n' + result.apiKey + '\\n\\nSave this key securely!');
          window.location.href = '/beta/success';
        } else {
          alert('Error: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        alert('Error signing agreement: ' + error.message);
      }
    });
  </script>
</body>
</html>
    `;
  }

  async saveSignedAgreement(signatureToken, signedByName, signedByEmail) {
    const result = await this.pool.query(
      `UPDATE beta_customers
       SET
         status = 'active',
         agreement_signed_at = CURRENT_TIMESTAMP,
         agreement_version = '1.0',
         signed_by_name = $1,
         signed_by_email = $2,
         signature_token = NULL,
         signature_token_expires_at = NULL
       WHERE signature_token = $3 AND signature_token_expires_at > CURRENT_TIMESTAMP
       RETURNING id, name, email, company_name`,
      [signedByName, signedByEmail, signatureToken]
    );

    return result.rows[0] || null;
  }
}

module.exports = BetaAgreementService;
