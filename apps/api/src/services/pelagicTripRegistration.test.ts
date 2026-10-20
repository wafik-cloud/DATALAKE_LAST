import { describe, expect, it } from 'vitest';
import { headerHasBoatRegistration, joinTripsWithRegistration } from './pelagicTripRegistration';

const boats = [
  {
    deviceId: 'dev-actuel',
    registrationNumber: '12 34/??',
    registrationAuthority: 'DPM',
    registrationExpiration: Date.parse('2027-03-01T00:00:00Z'),
    flag: 'MAR',
    ownerName: 'Armateur, SARL',
  },
  {
    deviceId: 'dev-retire-ailleurs',
    registrationNumber: 'NEW-9',
    registrationAuthority: 'DPM',
    registrationExpiration: Date.parse('2028-01-01T00:00:00Z'),
    flag: 'MAR',
    ownerName: 'Autre',
  },
];

describe('headerHasBoatRegistration', () => {
  it('reconnaît un fichier déjà joint et un export Pelagic brut', () => {
    expect(headerHasBoatRegistration(
      'Trip,Device Id,registrationNumber,registrationAuthority,registrationExpiration,flag,ownerName'
    )).toBe(true);
    expect(headerHasBoatRegistration(
      'Trip,Started,Ended,Boat,Boat Name,Boat Gear,Community,Duration (Seconds),Range (Meters),Distance (Meters),Created,Updated,IMEI,Device Id,Last Seen'
    )).toBe(false);
  });
});

describe('joinTripsWithRegistration', () => {
  it('ajoute les colonnes d’immatriculation sans retirer les colonnes du trip', () => {
    const csv = [
      'Trip,Started,Boat Name,Device Id',
      'T1,2026-10-01,Bateau A,dev-actuel',
      'T2,2026-10-02,Bateau B,dev-inconnu',
    ].join('\n');

    const joined = joinTripsWithRegistration(csv, boats);

    expect(joined.headerLine).toBe(
      'Trip,Started,Boat Name,Device Id,registrationNumber,registrationAuthority,registrationExpiration,flag,ownerName'
    );
    expect(joined.rowCount).toBe(2);
    expect(joined.unmatched).toBe(1);
    expect(joined.csv).toContain('T1,2026-10-01,Bateau A,dev-actuel,12 34/??,DPM,2027-03-01,MAR,"Armateur, SARL"');
    expect(joined.csv).toContain('T2,2026-10-02,Bateau B,dev-inconnu,,,,,');
  });

  it('laisse les colonnes vides si l’appareil a été retiré du bateau', () => {
    const csv = 'Trip,Device Id\nT-retire,dev-plus-sur-aucun-bateau\n';
    const joined = joinTripsWithRegistration(csv, boats);
    expect(joined.unmatched).toBe(1);
    expect(joined.csv).toContain('T-retire,dev-plus-sur-aucun-bateau,,,,,');
  });

  it('étiquette un ancien trip avec le bateau qui porte l’appareil aujourd’hui', () => {
    const csv = 'Trip,Boat Name,Device Id\nT-ancien,Ancien nom,dev-retire-ailleurs\n';
    const joined = joinTripsWithRegistration(csv, boats);
    expect(joined.unmatched).toBe(0);
    expect(joined.csv).toContain('T-ancien,Ancien nom,dev-retire-ailleurs,NEW-9,DPM,2028-01-01,MAR,Autre');
  });

  it('recopie un numéro mal formé tel qu’il est saisi', () => {
    const csv = 'Trip,Device Id\nT1,dev-actuel\n';
    const joined = joinTripsWithRegistration(csv, boats);
    expect(joined.csv).toContain('12 34/??');
  });

  it('préserve les champs multilignes, accents, guillemets et identifiants numériques', () => {
    const joined = joinTripsWithRegistration(
      '\uFEFFTrip,Boat Name,Device Id\r\nT1,"Étoile ""A""\r\nSud",42\r\n',
      [{ deviceId: 42, registrationNumber: '0012', ownerName: 'Pêche, SARL' }],
    );
    expect(joined.rowCount).toBe(1);
    expect(joined.unmatched).toBe(0);
    expect(joined.csv).toContain('T1,"Étoile ""A""\r\nSud",42,0012,,,,"Pêche, SARL"');
  });

  it('signale les réponses sans Device Id et celles atteignant le plafond Pelagic', () => {
    const missing = joinTripsWithRegistration('Trip\nT1\n', boats);
    expect(missing.deviceIdColumnMissing).toBe(true);
    expect(missing.unmatched).toBe(1);
    const full = joinTripsWithRegistration('Trip,Device Id\n' + 'T1,dev-actuel\n'.repeat(10_000), boats);
    expect(full.rowCount).toBe(10_000);
    expect(full.hitRowLimit).toBe(true);
  });
});
