-- team-documents: private bucket, reached only through /api/team/documents.
--
-- The bucket was public, so anyone with a link could read a file, and the storage policies let any coach
-- upload to or delete from any team's folder. It held 0 files and team_documents 0 rows when this ran.
-- The route checks the caller's team and uses the service role, so the browser needs no storage policy.
update storage.buckets
   set public = false,
       file_size_limit = 20971520,
       allowed_mime_types = array['application/pdf']
 where id = 'team-documents';

drop policy if exists "Coaches can delete team documents" on storage.objects;
drop policy if exists "Coaches can upload team documents" on storage.objects;
drop policy if exists "Team members can read team documents" on storage.objects;
