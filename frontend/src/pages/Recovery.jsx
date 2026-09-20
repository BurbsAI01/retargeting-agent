import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/Recovery.css';

export default function Recovery() {
  const [recoveryData, setRecoveryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [converting, setConverting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const token = new URLSearchParams(window.location.search).get('token') ||
    window.location.pathname.split('/').pop();

  useEffect(() => {
    fetchRecoveryData();
  }, [token]);

  const fetchRecoveryData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/recovery/${token}`
      );
      setRecoveryData(response.data);

      // Track page view
      await axios.post(
        `${process.env.REACT_APP_API_URL}/recovery/${token}/view`,
        { utm_source: new URLSearchParams(window.location.search).get('utm_source') || 'email' }
      );
    } catch (err) {
      if (err.response?.status === 410) {
        setError('This recovery link has expired. Please request a new quote.');
      } else if (err.response?.status === 404) {
        setError('Recovery link not found.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async (e) => {
    e.preventDefault();
    try {
      setConverting(true);
      const formData = new FormData(e.target);

      await axios.post(
        `${process.env.REACT_APP_API_URL}/recovery/${token}/convert`,
        {
          amount: recoveryData.pricing.final,
          order_id: formData.get('order_id'),
        }
      );

      // Show success message
      setRecoveryData({ ...recoveryData, already_converted: true });
      setShowForm(false);
    } catch (err) {
      setError('Error processing conversion. Please try again.');
      console.error(err);
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <div className="recovery-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading your quote...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="recovery-container">
        <div className="error-card">
          <div className="error-icon">⚠️</div>
          <h2>Oops!</h2>
          <p>{error}</p>
          <p className="error-subtext">
            Please contact us if you need help.
          </p>
        </div>
      </div>
    );
  }

  if (!recoveryData) {
    return null;
  }

  const { quote, discount, pricing, visitor, incentives, copy_variant } = recoveryData;

  return (
    <div className="recovery-container">
      {/* Hero Section */}
      <div className="recovery-hero">
        <div className="hero-content">
          <h1 className="hero-title">
            {copy_variant?.subject || "Your Quote is Waiting"}
          </h1>
          <p className="hero-subtitle">
            {copy_variant?.preview_text || "We miss you! Complete your purchase today."}
          </p>
        </div>
      </div>

      <div className="recovery-content">
        {/* Quote Card */}
        <div className="quote-card">
          <div className="quote-header">
            <h2>Your Original Quote</h2>
            <span className="quote-age">
              Generated {quote.days_ago} {quote.days_ago === 1 ? 'day' : 'days'} ago
            </span>
          </div>

          <div className="quote-details">
            {quote.description && (
              <div className="detail-item">
                <span className="label">Service:</span>
                <span className="value">{quote.description}</span>
              </div>
            )}

            {quote.scope && (
              <div className="detail-item">
                <span className="label">Scope:</span>
                <span className="value">{quote.scope}</span>
              </div>
            )}

            {quote.timeline && (
              <div className="detail-item">
                <span className="label">Timeline:</span>
                <span className="value">{quote.timeline}</span>
              </div>
            )}
          </div>

          {/* Pricing Section */}
          <div className="pricing-section">
            <div className="price-row original">
              <span className="label">Original Price:</span>
              <span className="amount">${pricing.original.toFixed(2)}</span>
            </div>

            {discount.enabled && discount.percent > 0 && (
              <>
                <div className="price-row discount">
                  <span className="label">
                    {discount.percent}% Discount:
                  </span>
                  <span className="amount discount-amount">
                    -${pricing.discount_amount.toFixed(2)}
                  </span>
                </div>

                <div className="price-divider"></div>

                <div className="price-row final">
                  <span className="label final-label">You Pay:</span>
                  <span className="amount final-amount">
                    ${pricing.final.toFixed(2)}
                  </span>
                </div>

                <div className="savings-badge">
                  Save ${pricing.discount_amount.toFixed(2)} ({discount.percent}% off)
                </div>
              </>
            )}
          </div>

          {/* Incentives */}
          {incentives && incentives.length > 0 && (
            <div className="incentives-section">
              <h3>Included Benefits</h3>
              <ul className="incentives-list">
                {incentives.map((incentive, idx) => (
                  <li key={idx}>
                    <span className="checkmark">✓</span>
                    {incentive.description || incentive}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Expiration Notice */}
          {discount.expires_at && (
            <div className="expiration-notice">
              <span className="clock-icon">⏱️</span>
              This offer expires on{' '}
              {new Date(discount.expires_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          )}
        </div>

        {/* CTA Section */}
        <div className="cta-section">
          {recoveryData.already_converted ? (
            <div className="success-message">
              <div className="success-icon">✅</div>
              <h3>Thank You!</h3>
              <p>Your conversion has been recorded. We'll be in touch soon with next steps.</p>
            </div>
          ) : (
            <>
              <div className="cta-text">
                <h3>{copy_variant?.body || "Don't miss out on this opportunity"}</h3>
                <p>Complete your purchase now and get your special discount.</p>
              </div>

              {!showForm ? (
                <button
                  className="cta-button primary-button"
                  onClick={() => setShowForm(true)}
                >
                  {copy_variant?.cta_text || "Complete Purchase"}
                </button>
              ) : (
                <form onSubmit={handleConvert} className="conversion-form">
                  <div className="form-group">
                    <label htmlFor="name">Full Name</label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      placeholder={visitor.name}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      placeholder={visitor.email}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="order_id">Purchase Reference (Optional)</label>
                    <input
                      type="text"
                      id="order_id"
                      name="order_id"
                      placeholder="Enter reference number if you have one"
                    />
                  </div>

                  <div className="form-actions">
                    <button
                      type="submit"
                      className="cta-button primary-button"
                      disabled={converting}
                    >
                      {converting ? 'Processing...' : 'Confirm & Complete'}
                    </button>
                    <button
                      type="button"
                      className="cta-button secondary-button"
                      onClick={() => setShowForm(false)}
                    >
                      Cancel
                    </button>
                  </div>

                  <p className="form-disclaimer">
                    We'll send a confirmation to your email address.
                  </p>
                </form>
              )}
            </>
          )}
        </div>

        {/* Trust Section */}
        <div className="trust-section">
          <div className="trust-item">
            <span className="trust-icon">🔒</span>
            <span className="trust-text">Secure Payment</span>
          </div>
          <div className="trust-item">
            <span className="trust-icon">✓</span>
            <span className="trust-text">Money-Back Guarantee</span>
          </div>
          <div className="trust-item">
            <span className="trust-icon">📞</span>
            <span className="trust-text">24/7 Support</span>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="faq-section">
          <h3>Common Questions</h3>
          <details className="faq-item">
            <summary>How long is this offer valid?</summary>
            <p>
              This special offer is valid until{' '}
              {discount.expires_at
                ? new Date(discount.expires_at).toLocaleDateString()
                : '30 days from the quote date'}
              . Act now to secure this price!
            </p>
          </details>

          <details className="faq-item">
            <summary>Can I modify the quote details?</summary>
            <p>
              Yes! If you'd like to adjust the scope or timeline, our team can prepare an updated
              quote. Please contact us after completing this purchase.
            </p>
          </details>

          <details className="faq-item">
            <summary>What happens after I purchase?</summary>
            <p>
              You'll receive a confirmation email immediately. Our team will review your order and
              reach out within 24 hours to confirm next steps and answer any questions.
            </p>
          </details>

          <details className="faq-item">
            <summary>Is there a cancellation policy?</summary>
            <p>
              Yes, we offer a 30-day money-back guarantee. If you're not satisfied for any reason,
              we'll provide a full refund.
            </p>
          </details>
        </div>

        {/* Footer CTA */}
        <div className="footer-cta">
          <p>Questions? We're here to help!</p>
          <a href={`mailto:${process.env.REACT_APP_SUPPORT_EMAIL || 'support@example.com'}`}>
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
