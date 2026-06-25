import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fetchPhygitalPassport } from '../library/phygital/passportClient.js';
import { MOCK_SERIAL_IDS } from '../library/phygital/passportMockData.js';
import styles from './PhygitalVerify.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

const PhygitalVerify = () => {
  const { serialId } = useParams();
  const [searchParams] = useSearchParams();
  const tapToken = searchParams.get('tap');

  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('none');
  const [passport, setPassport] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPhygitalPassport(serialId, { tapToken })
      .then((result) => {
        if (cancelled) return;
        setPassport(result.passport);
        setSource(result.source);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serialId, tapToken]);

  if (loading) {
    return (
      <div className={styles.phygitalVerify}>
        <p className={styles.loading}>Loading Digital Twin Passport…</p>
      </div>
    );
  }

  if (!passport) {
    return (
      <div className={styles.phygitalVerify}>
        <header className={styles.header}>
          <p className={styles.brand}>Space-Time</p>
          <h1 className={styles.title}>Digital Twin Passport</h1>
        </header>
        <div className={styles.notFound}>
          <p>No passport found for serial <strong>{serialId}</strong>.</p>
          <p className={styles.tapHint}>
            Mock serials: {MOCK_SERIAL_IDS.join(', ')}
          </p>
          <Link className={styles.backLink} to="/">
            ← OpenNexus3DStudio
          </Link>
        </div>
      </div>
    );
  }

  const showMockBanner = source === 'mock' || passport.mock;

  return (
    <div className={styles.phygitalVerify}>
      <header className={styles.header}>
        <p className={styles.brand}>{passport.brand}</p>
        <h1 className={styles.title}>Digital Twin Passport</h1>
        <p className={styles.subtitle}>Phygital apparel verification</p>
      </header>

      {showMockBanner && (
        <div className={styles.mockBanner}>
          Mock mode — NFC supplier TBD. Production tap verification and download URLs coming in a
          later phase.
        </div>
      )}

      <section className={styles.card}>
        <h2>Identity</h2>
        <div className={styles.serial}>{passport.serialId}</div>
        {passport.status === 'authentic' && (
          <span className={styles.statusAuthentic}>Authentic</span>
        )}
        <div className={`${styles.metaRow} ${styles.metaRowSpaced}`}>
          <span className={styles.metaLabel}>SKU</span>
          <span className={styles.metaValue}>{passport.sku}</span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Edition</span>
          <span className={styles.metaValue}>{passport.edition}</span>
        </div>
      </section>

      <section className={styles.card}>
        <h2>NFC (physical)</h2>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Supplier</span>
          <span className={styles.metaValue}>{passport.nfc.vendor}</span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Chip</span>
          <span className={styles.metaValue}>{passport.nfc.chipModel}</span>
        </div>
        {tapToken && (
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Tap token</span>
            <span className={styles.metaValue} title={tapToken}>
              {tapToken.length > 24 ? `${tapToken.slice(0, 24)}…` : tapToken}
            </span>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2>Digital twin downloads</h2>
        <ul className={styles.assetList}>
          {passport.digitalTwin.assets.map((asset) => (
            <li key={asset.format} className={styles.assetItem}>
              <div>
                <div className={styles.assetFormat}>{asset.format}</div>
                <div>{asset.label}</div>
              </div>
              {asset.url ? (
                <a
                  className={styles.downloadBtn}
                  href={asset.url}
                  download
                  rel="noopener noreferrer"
                >
                  Download
                </a>
              ) : (
                <span className={styles.plannedTag}>{asset.status || 'planned'}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.card}>
        <h2>Provenance</h2>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Manufactured</span>
          <span className={styles.metaValue}>
            {formatDate(passport.provenance.manufacturedAt)}
          </span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Region</span>
          <span className={styles.metaValue}>
            {passport.provenance.fulfillmentRegion || '—'}
          </span>
        </div>
        {passport.provenance.notes && (
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Notes</span>
            <span className={styles.metaValue}>{passport.provenance.notes}</span>
          </div>
        )}
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>On-chain</span>
          <span className={styles.metaValue}>{passport.onChain.status}</span>
        </div>
      </section>

      <p className={styles.tapHint}>
        NFC chips will open this page on tap. Secure SUN validation is planned for Phase 3.
      </p>

      <div style={{ textAlign: 'center' }}>
        <Link className={styles.backLink} to="/">
          ← OpenNexus3DStudio
        </Link>
      </div>
    </div>
  );
};

export default PhygitalVerify;
