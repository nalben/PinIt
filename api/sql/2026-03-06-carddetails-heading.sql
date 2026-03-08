ALTER TABLE carddetails
  ADD COLUMN heading VARCHAR(50) NULL AFTER card_id;

UPDATE carddetails cd
JOIN cards c ON c.id = cd.card_id
SET cd.heading = c.title
WHERE (cd.heading IS NULL OR cd.heading = '');
