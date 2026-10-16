-- Njarðvík W (basketball) is an INDOOR Titan (Integrated Bionics / Hudl) team, not Catapult.
-- Set the team data-source profile so Today renders the Titan upload card + indoor gating,
-- and no Catapult sync is attempted for them. Data-only (no schema change); idempotent.
update teams
set gps_provider = 'titan',
    training_mode_default = 'indoor'
where id = 'a174db7b-b417-44df-9e7f-efffeee5d764'
  and (gps_provider is distinct from 'titan' or training_mode_default is distinct from 'indoor');
