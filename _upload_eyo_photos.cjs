/**
 * Upload EYO product photos to Supabase Storage and set HTTPS photo_url.
 * Prerequisites: run 20261001130100_eyo_abidjan_and_photos.sql first.
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = process.cwd()
const IMG_DIR = path.join(ROOT, 'public', 'products', 'eyo')

function loadEnv() {
  const env = {}
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const PRODUCTS = [
  {
    "id": "59e66c1c-b70b-46ab-8ac2-940405f333af",
    "file": "JK-1.png"
  },
  {
    "id": "bcdb99d2-66fb-48e9-a221-cf97fc649e8b",
    "file": "JK-2.png"
  },
  {
    "id": "95aec582-a468-4091-a986-1db4a1e2a762",
    "file": "57-3.png"
  },
  {
    "id": "974ff639-2b65-4502-9895-59d0f4afb044",
    "file": "10-35.png"
  },
  {
    "id": "710663c9-cc07-46c5-a05c-25949cd632c9",
    "file": "RW-100.png"
  },
  {
    "id": "c7c5f77a-96c5-4ff9-9940-2c64b73497aa",
    "file": "RW-101.png"
  },
  {
    "id": "a8f9d93b-d411-4681-b3ad-b39e3d6259c8",
    "file": "RW-102.png"
  },
  {
    "id": "abcac20d-f348-4a54-90ac-f1fea20d6ce4",
    "file": "10-10.png"
  },
  {
    "id": "ad5f3af3-d8d9-40a7-b8cd-ec5de12b8c4c",
    "file": "45-1-R12.png"
  },
  {
    "id": "4cf41dd5-be96-401c-b18d-e102593b38cd",
    "file": "55-129.png"
  },
  {
    "id": "336568d1-54cd-45bd-ad2e-963ba9f06996",
    "file": "_missing.png"
  },
  {
    "id": "9826be1d-dcab-4666-a452-e087e31f273e",
    "file": "_missing.png"
  },
  {
    "id": "9da54f1a-ea1f-4f4a-8508-5e210a48c9c2",
    "file": "55-132.png"
  },
  {
    "id": "dcf984f1-c2f7-4a13-9b6b-25337b684dd9",
    "file": "10-28.png"
  },
  {
    "id": "458b6e81-c7d1-48a0-b47c-514e1465cc14",
    "file": "_missing.png"
  },
  {
    "id": "b7302f2e-1a5b-4c5c-99f2-b9c047a886e5",
    "file": "_missing.png"
  },
  {
    "id": "4c40f2cc-47c3-4702-88b8-40682fdbc034",
    "file": "_missing.png"
  },
  {
    "id": "fbd02cb4-a8f1-47a5-89b9-254e7696146f",
    "file": "_missing.png"
  },
  {
    "id": "23a8284c-e6b6-4468-a9ee-08efd87fea2e",
    "file": "_missing.png"
  },
  {
    "id": "0693f7b7-a7cb-44a4-9c5a-b3bc009e4124",
    "file": "48-1.jpeg"
  },
  {
    "id": "c1fa0bcc-fda1-44ac-b7e4-7baa19239e88",
    "file": "_missing.png"
  },
  {
    "id": "2827c16f-e0fa-4e28-85ea-97000e028ef9",
    "file": "_missing.png"
  },
  {
    "id": "d66cfe4d-78dd-4de5-8783-d309c005cc21",
    "file": "_missing.png"
  },
  {
    "id": "cfaae1c4-81b6-4533-bafe-983e7209d42a",
    "file": "48-12.jpeg"
  },
  {
    "id": "cbbadd22-d5d6-42ef-b869-df69bbb5b7ac",
    "file": "48-13.png"
  },
  {
    "id": "0745caf1-feb9-4df8-aaf8-d1d90937c1e4",
    "file": "24-1.png"
  },
  {
    "id": "b5e7abf8-0f00-4eda-8d53-264dd3793108",
    "file": "_missing.png"
  },
  {
    "id": "1468cbae-12a2-4242-88a7-06b8c73535e5",
    "file": "_missing.png"
  },
  {
    "id": "bf38cb6f-90e4-4eff-9e11-9707c488ff44",
    "file": "10-1.png"
  },
  {
    "id": "0a7c381e-00cb-42c5-8731-91b57cf00328",
    "file": "10-7.png"
  },
  {
    "id": "65fd41c3-02c6-4bf0-a7e1-a2b6f5f99ccc",
    "file": "_missing.png"
  },
  {
    "id": "1ef03132-39ea-47a9-9266-788c23a1c672",
    "file": "10-18.png"
  },
  {
    "id": "342a256b-399d-4fe2-9e0c-b9d39e56c828",
    "file": "_missing.png"
  },
  {
    "id": "e21e1c34-233a-45df-bb37-806e28cca3ea",
    "file": "10-20.png"
  },
  {
    "id": "ab7bf2fc-9c79-429e-859f-c14932a5869b",
    "file": "55-80.jpeg"
  },
  {
    "id": "d32d788e-7520-4212-b91a-30e893450ec9",
    "file": "55-81.jpeg"
  },
  {
    "id": "c519aea4-9f5f-4b83-bdcd-1c566acfff75",
    "file": "55-82.jpeg"
  },
  {
    "id": "b745d99b-d10b-4ac1-9d3c-8eee673e310c",
    "file": "55-83.png"
  },
  {
    "id": "8fbb7612-e8df-4025-9409-052d9d6d078f",
    "file": "55-84.jpeg"
  },
  {
    "id": "12bc38ef-33b3-4e33-bb54-f9dcc7497060",
    "file": "55-85.jpeg"
  },
  {
    "id": "58e2978c-6bd3-48bc-8cd3-dba603216659",
    "file": "55-86.jpeg"
  },
  {
    "id": "eba2cda3-7dde-4a65-9f67-ddf50bedb5dc",
    "file": "55-87.jpeg"
  },
  {
    "id": "278c2473-3422-4a1e-b993-58d56a9b1247",
    "file": "55-88.jpeg"
  },
  {
    "id": "3f43ff1e-48b6-429d-891b-4655d591ca97",
    "file": "55-89.jpeg"
  },
  {
    "id": "f754f965-fce6-4058-a833-34eb29302e34",
    "file": "55-90.jpeg"
  },
  {
    "id": "de0dd123-4aad-4b02-97c3-c4c196c0e7a0",
    "file": "55-91.jpeg"
  },
  {
    "id": "c68c7430-a220-48e0-90fb-f1a19bfb67fd",
    "file": "55-92.jpeg"
  },
  {
    "id": "a9b4d805-0cbb-4a4f-a156-f10b72ed964d",
    "file": "55-93.jpeg"
  },
  {
    "id": "6df90407-55be-4b08-96e5-e12c56835d7d",
    "file": "55-94.jpeg"
  },
  {
    "id": "5a522d84-2d48-4f66-b8fc-dba0dd6bb4d9",
    "file": "55-95.jpeg"
  },
  {
    "id": "30ff4221-a048-4d2d-bae8-5337e917b14f",
    "file": "55-96.jpeg"
  },
  {
    "id": "aca614ef-7373-4405-ac23-a33a15c664a6",
    "file": "55-97.jpeg"
  },
  {
    "id": "778f46d7-de88-4869-aca6-4c58c25f9f48",
    "file": "55-98.jpeg"
  },
  {
    "id": "44b8b45e-7882-47c5-9107-198f4512439c",
    "file": "55-99.jpeg"
  },
  {
    "id": "139a259d-5348-4f9c-a9b0-fdf448100ab5",
    "file": "55-100.jpeg"
  },
  {
    "id": "6aa5f609-4156-4538-99d0-88881b3c643d",
    "file": "55-101.jpeg"
  },
  {
    "id": "e46705d0-277a-4e12-aad7-afa6a8a01eca",
    "file": "55-102.jpeg"
  },
  {
    "id": "77535028-a471-4084-8b15-7e7ac59c19d6",
    "file": "55-103.jpeg"
  },
  {
    "id": "67a8394f-3f2c-42b4-9bc5-07058b0517ba",
    "file": "55-104.jpeg"
  },
  {
    "id": "7cee1af5-684c-4369-bb59-23eb9747fe89",
    "file": "55-105.jpeg"
  },
  {
    "id": "aba8b5b4-fa3c-4460-84d6-342fc8577018",
    "file": "55-106.jpeg"
  },
  {
    "id": "38ea642f-8bc4-4f80-b262-6967d231c650",
    "file": "55-107.jpeg"
  },
  {
    "id": "015e9ebd-d723-4264-8751-5c18edc853ea",
    "file": "55-108.jpeg"
  },
  {
    "id": "aedaacdf-baef-4a8f-8431-b1bfe2d39de1",
    "file": "55-109.jpeg"
  },
  {
    "id": "54d02ade-8ee2-43cb-a1e2-33b25d550a4d",
    "file": "55-110.jpeg"
  },
  {
    "id": "1705728b-a402-4e2c-971e-107335bc67bc",
    "file": "55-111.jpeg"
  },
  {
    "id": "25717f98-43ee-4b9d-be20-44881557e5bd",
    "file": "55-112.jpeg"
  },
  {
    "id": "d19de525-b93a-46e9-a96f-939643b1dec7",
    "file": "55-113.jpeg"
  },
  {
    "id": "40d837d4-c5ec-43fe-b379-55ef960f2ea2",
    "file": "55-114.jpeg"
  },
  {
    "id": "76ff8627-9f27-4a72-ad50-5f57004b38d3",
    "file": "55-115.jpeg"
  },
  {
    "id": "fe568f7a-1d84-4602-b269-c7fe0d6cbb34",
    "file": "55-116.jpeg"
  },
  {
    "id": "f4c80003-df1f-43cb-9ce6-dda8d82028ee",
    "file": "FHM-40.jpeg"
  },
  {
    "id": "8755180d-af7b-4cc5-a73f-5067d476c01a",
    "file": "FHM-19.jpeg"
  },
  {
    "id": "0e055dbc-214e-41fa-b5b0-3a3744b2ca6f",
    "file": "5-2.png"
  },
  {
    "id": "ac02bcc0-59a9-4aa7-85ef-f8c9745e4ce4",
    "file": "_missing.png"
  },
  {
    "id": "e4b7b3d7-05ec-4a22-bd1b-95e38c616912",
    "file": "_missing.png"
  },
  {
    "id": "66ae8dbb-cc3a-49ab-9392-a520e12e8c47",
    "file": "_missing.png"
  },
  {
    "id": "125343f4-03d3-4db3-9796-92e713c9b0de",
    "file": "_missing.png"
  },
  {
    "id": "d27cf1ce-1f67-4104-a798-abf1f5c64791",
    "file": "5-7-R82.png"
  },
  {
    "id": "210a253d-cf9a-4066-bc25-3d987b9391dd",
    "file": "53-1-R83.jpeg"
  },
  {
    "id": "9ce17365-b15b-44a4-be02-65fa63bcd8ed",
    "file": "53-2.jpeg"
  },
  {
    "id": "448c563e-5cbe-4b1a-92df-4934c979675c",
    "file": "53-3.jpeg"
  },
  {
    "id": "2bd52136-c6e0-4013-8953-44fb5c13853a",
    "file": "53-4.jpeg"
  },
  {
    "id": "f1df2fda-49ef-4795-85f7-326c71c0b22b",
    "file": "53-6.jpeg"
  },
  {
    "id": "c19f1b4d-e368-411f-9f79-8fe7fb5f19c8",
    "file": "53-7.jpeg"
  },
  {
    "id": "ee594f23-6e90-48ba-af79-4b7fe82e1417",
    "file": "53-6-1.png"
  },
  {
    "id": "ea9ce7ba-f0a0-4af9-98a5-9f5f5af2e52f",
    "file": "53-1-R90.png"
  },
  {
    "id": "c78069eb-cb79-430d-a167-96c5f3d12535",
    "file": "30-1.png"
  },
  {
    "id": "2f809ac2-518c-459e-a49f-b2b9c54b1ae0",
    "file": "30-2.png"
  },
  {
    "id": "82a0190e-e736-450f-865e-7cb7e72c8deb",
    "file": "G-3.png"
  },
  {
    "id": "92f4f908-dc2f-4b21-8b84-e3933bbc0593",
    "file": "30-4.png"
  },
  {
    "id": "76c252f8-d497-402f-b895-85638f299da5",
    "file": "30-6.jpeg"
  },
  {
    "id": "25b0cf9e-7eb5-40b7-ba78-dccf66f23699",
    "file": "30-7.jpeg"
  },
  {
    "id": "e16e02a1-4ab9-4e54-b453-e9211b6c0c22",
    "file": "30-8.png"
  },
  {
    "id": "42f5bb28-c564-453a-8219-9f7cbbd9b377",
    "file": "37-2.jpeg"
  },
  {
    "id": "2d8a8413-c4e8-4909-9744-7dacce278f7f",
    "file": "202.png"
  },
  {
    "id": "a6873e5d-9dad-4e7a-8e00-8f5c1ef26933",
    "file": "21-1.png"
  },
  {
    "id": "14ae06a1-7994-479c-8c9f-b285df9446ff",
    "file": "_missing.png"
  },
  {
    "id": "7b29109b-51a9-40fc-9b3a-ae91a6641e7b",
    "file": "_missing.png"
  },
  {
    "id": "e96f8bab-d368-446e-89cb-d8afad986628",
    "file": "_missing.png"
  },
  {
    "id": "c62c1432-be17-4537-af17-8aa808fa80a3",
    "file": "_missing.png"
  },
  {
    "id": "8c093303-133b-4f19-b6e5-e50fb6233064",
    "file": "21-7.png"
  },
  {
    "id": "82b2e6cb-7d42-4c7b-9de4-16964a21c5e6",
    "file": "21-17.png"
  },
  {
    "id": "b8383343-d24d-419c-a0b8-707a6db673df",
    "file": "CB-1.png"
  },
  {
    "id": "e092178c-9cfe-41f7-abca-2be7c247fc3d",
    "file": "_missing.png"
  },
  {
    "id": "5045723d-348a-4d93-998f-92f8d071b72e",
    "file": "_missing.png"
  },
  {
    "id": "c91819b2-37c1-49ac-8ec6-b808eb167587",
    "file": "55-128.png"
  },
  {
    "id": "2a17cb8f-f4c1-41dc-8935-68232f635713",
    "file": "40-1.png"
  },
  {
    "id": "693d7225-9bb2-4bfd-9ffe-02d12854f1e4",
    "file": "40-2-R113.png"
  },
  {
    "id": "2077d0b5-b2e8-4050-9a1f-f398ddc3100d",
    "file": "40-2-R114.png"
  },
  {
    "id": "4586e622-7681-4a1f-bc72-ea4a68251729",
    "file": "40-30.png"
  },
  {
    "id": "5c316f8d-1c27-4151-822e-ee4de584cbef",
    "file": "40-5.png"
  },
  {
    "id": "c2f3610e-f871-4bb9-8ab0-cede8983b72d",
    "file": "40-6.png"
  },
  {
    "id": "110cca95-bcf6-4d05-a740-39ac040b016e",
    "file": "55-1.png"
  },
  {
    "id": "d2453112-97a5-4e8f-914a-8e592eeb3232",
    "file": "_missing.png"
  },
  {
    "id": "f8796509-78ba-4017-a3ee-c94010b9a679",
    "file": "_missing.png"
  },
  {
    "id": "dade1c7d-3f0d-4082-8bd1-b70baff16f56",
    "file": "_missing.png"
  },
  {
    "id": "05c6b7a1-c078-4abe-bef0-0650f6c084b8",
    "file": "_missing.png"
  },
  {
    "id": "95df5049-0c8f-456f-ba9c-99716700880d",
    "file": "_missing.png"
  },
  {
    "id": "123f94df-40f4-42de-b120-6ab341e3b127",
    "file": "_missing.png"
  },
  {
    "id": "2df2a37a-4981-4a75-abda-9a5c56553156",
    "file": "_missing.png"
  },
  {
    "id": "fca2424c-13d2-4672-af18-81a05ee0a8b8",
    "file": "55-15.png"
  },
  {
    "id": "51abaaea-6ada-4f08-b747-9ff2469d2876",
    "file": "55-133.png"
  },
  {
    "id": "8564ff42-9023-46c4-992b-00f06c6e3910",
    "file": "_missing.png"
  },
  {
    "id": "7640a88d-79d0-4819-94ba-996983b39076",
    "file": "_missing.png"
  },
  {
    "id": "e96935ec-5128-49c3-9f3b-7c2e3d2e13c7",
    "file": "45-1-R130.jpeg"
  },
  {
    "id": "936e8884-9e19-4cf3-b4fb-4d1b511dbacf",
    "file": "_missing.png"
  },
  {
    "id": "a08fa71f-e0f8-44e4-9828-8628e5f444b5",
    "file": "_missing.png"
  },
  {
    "id": "764f655a-c103-467d-8718-e3ee65205621",
    "file": "47-1.jpeg"
  },
  {
    "id": "2093c59c-1452-45f0-8c6c-5b6f71bb1a40",
    "file": "47-12.jpeg"
  },
  {
    "id": "712d4121-7317-4bca-91e5-347e781f70aa",
    "file": "47-14.jpeg"
  },
  {
    "id": "2ff3cfb5-006b-407e-8c74-1b38c23fe129",
    "file": "47-18.jpeg"
  },
  {
    "id": "3d8c772b-aaf5-4e8f-9ed8-d8fc1a6b6f7e",
    "file": "47-19.jpeg"
  },
  {
    "id": "cdb34ced-8c5d-4c56-a62c-8733aa271de9",
    "file": "_missing.png"
  },
  {
    "id": "d847e607-a514-4d3f-aec2-9383ca9efc19",
    "file": "_missing.png"
  },
  {
    "id": "d05d82ff-f701-462e-b029-e77c580ebcd0",
    "file": "47-22.jpeg"
  },
  {
    "id": "85f198fc-e381-4edc-8e89-4ae2f4ce582a",
    "file": "3-23.png"
  },
  {
    "id": "24667bcb-934e-42d8-863f-6e52eb9acc8c",
    "file": "_missing.png"
  },
  {
    "id": "04a40d14-4210-40ac-af0c-72a462c1972c",
    "file": "_missing.png"
  },
  {
    "id": "4b86b9e9-1c63-41de-b993-cf1f9dce7aff",
    "file": "_missing.png"
  },
  {
    "id": "df323425-c92a-4d01-9637-d2a906ee26e3",
    "file": "47-2.jpeg"
  },
  {
    "id": "72f3a3ad-3340-4164-b81f-757db11729fe",
    "file": "47-3.jpeg"
  },
  {
    "id": "01fa0d82-f905-4f7a-ab85-771e25f7d103",
    "file": "47-5.jpeg"
  },
  {
    "id": "5221b915-88fb-4620-b974-beee4874d24d",
    "file": "47-6.png"
  },
  {
    "id": "6cbf6bb0-cfad-4de8-bd76-c850afa6721e",
    "file": "_missing.png"
  },
  {
    "id": "87c53433-cb9b-4940-8ced-5eb1cf7be154",
    "file": "47-11.jpeg"
  },
  {
    "id": "9a5baed0-4505-4fc2-84f0-1e6edea05040",
    "file": "47-13.jpeg"
  },
  {
    "id": "478362fe-edd4-4ed8-8e33-e320e67c1902",
    "file": "47-15.jpeg"
  },
  {
    "id": "77c3c401-2d3f-4bdc-a0b2-eabb5e67c687",
    "file": "47-16.jpeg"
  },
  {
    "id": "6f170931-d469-4033-9c82-1e21a1f3cb3e",
    "file": "50-1.jpeg"
  },
  {
    "id": "cf521ae3-53aa-47d1-b622-b51b6dbb33f0",
    "file": "50-22.png"
  },
  {
    "id": "c3c93264-0eae-4286-8938-a95c5692030c",
    "file": "50-23.png"
  },
  {
    "id": "2be207b0-5966-401a-b73c-1e6f324f4777",
    "file": "B-14.png"
  },
  {
    "id": "453a1cb7-c5f3-4876-9e54-8dc16cd10e2e",
    "file": "3-4.jpeg"
  },
  {
    "id": "a7fe03e6-35c1-48e4-b2a8-95870c370b5d",
    "file": "_missing.png"
  },
  {
    "id": "2150761f-1bda-4248-9cf0-eb882993760a",
    "file": "_missing.png"
  },
  {
    "id": "01885888-0067-4e03-9576-fa97005d150d",
    "file": "47-17.jpeg"
  },
  {
    "id": "26d74ab2-8764-48f5-ad2a-4300c5301c13",
    "file": "47-23.jpeg"
  },
  {
    "id": "16b51d47-d8a5-4b23-ab6d-befb016ab8ed",
    "file": "55-136.png"
  },
  {
    "id": "18f55351-3eca-4fa5-a447-7d9ee12aa10a",
    "file": "55-137.png"
  },
  {
    "id": "8a82e450-bf39-4d37-82b3-98eb89a540e3",
    "file": "55-139.png"
  },
  {
    "id": "de304bb5-9706-4fb4-a0dc-846ee544b651",
    "file": "55-140-1.png"
  },
  {
    "id": "e15fa045-e710-402c-b442-5d168c2f6d67",
    "file": "_missing.png"
  },
  {
    "id": "e890cc2c-389a-43e8-a198-a11df45b5447",
    "file": "_missing.png"
  },
  {
    "id": "95b4656e-394a-4f24-a38c-63dedc44af2e",
    "file": "_missing.png"
  },
  {
    "id": "d1a4042d-91ac-4941-9e02-3c7f7db0dc9a",
    "file": "_missing.png"
  },
  {
    "id": "ce4f7214-ff28-4392-9354-9b527d7f85c5",
    "file": "55-145.png"
  },
  {
    "id": "2f07f79e-ef8b-484e-9da2-b02d46e19241",
    "file": "_missing.png"
  },
  {
    "id": "bc2161e1-40ff-46d2-838a-d183d24362d7",
    "file": "55-147.png"
  },
  {
    "id": "281a03f0-4bce-4248-b6a4-881f7349af17",
    "file": "55-148.png"
  },
  {
    "id": "949d7773-ef3f-4e47-a5a7-ba06bb2855d8",
    "file": "55-149-1.png"
  },
  {
    "id": "07e96617-a205-4a70-9a5d-2e48c4b291f9",
    "file": "_missing.png"
  },
  {
    "id": "0a082b78-f7ec-4ba7-a524-e1ff63ffc031",
    "file": "47-9.jpeg"
  },
  {
    "id": "479b1214-baa4-4a01-bbfb-7a5db6646a7b",
    "file": "_missing.png"
  },
  {
    "id": "6c522d53-e640-437d-9968-fa24c1712808",
    "file": "51-1.png"
  },
  {
    "id": "b5d18bae-c252-4988-8a62-bc1e9905df1a",
    "file": "55-151.png"
  },
  {
    "id": "ad3ed6f5-9f43-46c5-a457-9c6a6d5b21cf",
    "file": "26-70.jpeg"
  },
  {
    "id": "ecab4680-5d84-4c25-bea1-4d9b829ef1ad",
    "file": "26-71.jpeg"
  },
  {
    "id": "d75e9617-7631-41e0-aad9-ae77ef98d96e",
    "file": "38-1.jpeg"
  },
  {
    "id": "82dcff2a-45c9-4699-a4c9-5875c85b6906",
    "file": "38-2.jpeg"
  },
  {
    "id": "aa83a017-b29a-42f4-91fc-c541b116efd6",
    "file": "38-3.jpeg"
  },
  {
    "id": "e444095c-bead-40b5-8462-64235ce2570c",
    "file": "2-1.png"
  },
  {
    "id": "adb57408-159d-494c-b557-35b3929bbdd8",
    "file": "2-2.png"
  },
  {
    "id": "2fb08a9e-fded-4935-b660-38680b2fe0e7",
    "file": "5-4-R188.png"
  },
  {
    "id": "dfac89ea-618c-4031-8d2c-3510ff4b1a86",
    "file": "5-88.png"
  },
  {
    "id": "f603e5f8-2d98-4af2-af77-9e7283efd763",
    "file": "5-7-R190.png"
  },
  {
    "id": "15a00842-df64-4659-900d-28802242009e",
    "file": "5-8.png"
  },
  {
    "id": "2de81591-24f6-4f6a-afa1-8d090d40cfad",
    "file": "5-9.png"
  },
  {
    "id": "21b6a029-9e9b-4dae-8174-17870171206a",
    "file": "5-10.png"
  },
  {
    "id": "c6867460-262d-478d-a628-1f034eb33c8f",
    "file": "5-11.png"
  },
  {
    "id": "ca97f6ac-8783-49d2-bcff-eda1f94abbfc",
    "file": "5-12.png"
  },
  {
    "id": "04335c49-ed8b-4e41-80d6-4e83b691c4d9",
    "file": "RBT-8.png"
  },
  {
    "id": "825ffb7c-e271-4316-9e45-1d6581a18634",
    "file": "RBT-12.png"
  },
  {
    "id": "6dd4ebbb-a00b-42bd-a4e6-82c9d9ec7aa1",
    "file": "9-18.png"
  },
  {
    "id": "0c517f2b-1f9c-49db-bef4-c0d0fce36c7e",
    "file": "RBT-80.png"
  },
  {
    "id": "239374b5-1f18-4a67-a48e-9f623662efb4",
    "file": "_missing.png"
  },
  {
    "id": "1a33e484-6267-45c5-811d-fdb713964cd5",
    "file": "_missing.png"
  },
  {
    "id": "69ca932e-23c9-40a1-97fb-9407a189878b",
    "file": "_missing.png"
  },
  {
    "id": "1379855b-b629-4201-94a0-4b097ac9e652",
    "file": "_missing.png"
  },
  {
    "id": "a74172e9-7edd-465d-98e7-15d1e0c77f38",
    "file": "RBT-15.png"
  },
  {
    "id": "52ea7bd2-20e9-490b-8ce0-cf7055491d38",
    "file": "_missing.png"
  },
  {
    "id": "d1dc11fd-cad1-4c9b-a4e3-40d54c176610",
    "file": "55-127.png"
  },
  {
    "id": "173fb93a-c329-4749-b81a-c6c2479bc6b9",
    "file": "13-5.png"
  },
  {
    "id": "2af76fc2-d8f5-4f69-bb5d-c82ce0770b84",
    "file": "_missing.png"
  },
  {
    "id": "a8fcd932-af5c-419d-8a73-eb3f7d54248d",
    "file": "_missing.png"
  },
  {
    "id": "8c4f42ca-992b-4c0b-afcd-9e93ff81bec8",
    "file": "_missing.png"
  },
  {
    "id": "7ac69f9e-f216-4b24-9ff3-513ce9a926a8",
    "file": "70-1.png"
  },
  {
    "id": "44e02a48-9514-4913-823c-0443c065a95b",
    "file": "_missing.png"
  },
  {
    "id": "2a4d2418-d716-4c2d-a689-dd7f43a4272c",
    "file": "8-4.png"
  },
  {
    "id": "9b7c4dca-f353-4934-8283-6509b51c416d",
    "file": "8-5.png"
  },
  {
    "id": "9a4d3d25-a414-49ee-931b-c301db27323b",
    "file": "20-1.png"
  },
  {
    "id": "edbc9e3b-7096-4ec9-86b0-463e3073e976",
    "file": "_missing.png"
  },
  {
    "id": "c57cc60c-2277-4940-ad76-89282f5edcfe",
    "file": "_missing.png"
  },
  {
    "id": "997c9446-8292-4d3b-9c35-bbaafa2638bd",
    "file": "20-4.png"
  },
  {
    "id": "2c33fb91-776a-4d3e-81c2-7e48861770cc",
    "file": "_missing.png"
  },
  {
    "id": "f28c6de5-1129-4801-9b2b-e9c365b6e505",
    "file": "_missing.png"
  },
  {
    "id": "ed2a9949-68fb-4b19-afcb-6b52d3dcf214",
    "file": "FHM-41.png"
  },
  {
    "id": "d6b86610-1a32-4ece-8013-2d2f8e54f7af",
    "file": "FHM-42.jpeg"
  },
  {
    "id": "a325521f-0544-4028-bd5f-ed9fbbb6ef46",
    "file": "61-1.png"
  },
  {
    "id": "81e226f5-cf14-42d6-9e69-6f89c45bba35",
    "file": "61-2.png"
  },
  {
    "id": "c55a5aa3-aec7-4667-a54f-adfec9598831",
    "file": "52-1.jpeg"
  },
  {
    "id": "b07680ee-dd7c-4647-8379-c2e4ee99dd9c",
    "file": "44-1.png"
  },
  {
    "id": "dbcbde50-89f6-4d9b-836d-1761658eec99",
    "file": "_missing.png"
  },
  {
    "id": "771ed154-bfad-442d-bc77-89577f04914e",
    "file": "_missing.png"
  },
  {
    "id": "8081e661-8907-4116-9b8f-b08b8307a45a",
    "file": "32-1.png"
  },
  {
    "id": "80d22d43-255a-45c7-8281-e90b920584e1",
    "file": "32-2.png"
  },
  {
    "id": "47a56842-da41-4395-84fc-b044d85b7c9c",
    "file": "RD-3.png"
  },
  {
    "id": "a503835c-1b88-4152-bf63-33d117870cbb",
    "file": "46-1.jpeg"
  },
  {
    "id": "426bf6af-ce74-4747-9535-fa0db5a08f4a",
    "file": "46-2.jpeg"
  },
  {
    "id": "54b13c1e-b837-404f-9bd8-ea579d266af1",
    "file": "46-3.jpeg"
  },
  {
    "id": "d78c6f22-6ea8-4068-86d8-19e232c5a077",
    "file": "46-4.jpeg"
  },
  {
    "id": "e327fa13-87b7-410a-b4e6-59cc187a934d",
    "file": "46-6.jpeg"
  },
  {
    "id": "f7cf2cba-c802-4ca5-92eb-1906cfd39ee1",
    "file": "_missing.png"
  },
  {
    "id": "4b8553f3-4890-4319-9601-147a6a787b99",
    "file": "55-117.png"
  },
  {
    "id": "07e79dae-0b04-43c0-9574-015525d30198",
    "file": "_missing.png"
  },
  {
    "id": "b3834dcf-50b8-4e03-938d-2a3961227160",
    "file": "_missing.png"
  },
  {
    "id": "3ca18dc0-01f6-49b0-9df7-67168c70f7d7",
    "file": "_missing.png"
  },
  {
    "id": "c86b8d4d-7952-4e11-808c-0da3f79bc16b",
    "file": "55-121.png"
  },
  {
    "id": "823b3282-551b-43f7-b557-447967965f2c",
    "file": "55-123.png"
  },
  {
    "id": "1084c9e1-2d12-4338-8813-53c49ddd1d33",
    "file": "_missing.png"
  },
  {
    "id": "02480a11-4fcd-4dfb-87c3-5c1e9748a3b6",
    "file": "_missing.png"
  },
  {
    "id": "ed7557f0-b41d-4232-b418-054df92b515f",
    "file": "_missing.png"
  },
  {
    "id": "c0558853-3ea4-4f25-a507-5d9e0d448b22",
    "file": "55-153-1.png"
  },
  {
    "id": "100cbf5f-51a7-42b1-9e14-b30ccdda2bc4",
    "file": "_missing.png"
  },
  {
    "id": "4349baa6-bedd-4013-b97b-19f9fdf4cca2",
    "file": "55-154-1.png"
  },
  {
    "id": "2b36a983-0151-4f0c-a2ed-a1604f57c061",
    "file": "_missing.png"
  },
  {
    "id": "0f10ee1b-8ea3-43ef-a9d8-ebcf3370dec6",
    "file": "GJS-1.jpeg"
  },
  {
    "id": "86bf36ba-d1e2-48ed-8471-bb46c635d678",
    "file": "GJS-2.jpeg"
  },
  {
    "id": "43713ab8-a39e-4b2f-9146-5e8e93ef7301",
    "file": "GJS-3.jpeg"
  },
  {
    "id": "5221e38c-d024-4a9d-859e-36f113021a9a",
    "file": "GJS-4.jpeg"
  },
  {
    "id": "7a4dbfef-754b-49a2-94b7-5e65ade785ac",
    "file": "GJS-5.jpeg"
  },
  {
    "id": "95c3ebb8-a50e-41c3-a5c8-cc8a72ea8b99",
    "file": "GJS-6.jpeg"
  },
  {
    "id": "535576e3-a625-4db2-9eaa-f5f7de4822d8",
    "file": "GJS-7.jpeg"
  },
  {
    "id": "6ebb5022-b1a4-4a14-a779-b41cce336538",
    "file": "GJS-8.jpeg"
  },
  {
    "id": "de6b9d35-bce9-4536-8eaa-4242fcfd17d8",
    "file": "GJS-9.jpeg"
  },
  {
    "id": "7e3415c6-d8cc-4822-9264-ddb4ded4923b",
    "file": "GJS-10.jpeg"
  },
  {
    "id": "efe32603-6260-416c-ae92-80093cb816b0",
    "file": "_missing.png"
  },
  {
    "id": "1457547e-95fa-4cd4-bc46-7104217b8dc3",
    "file": "GJS-12.jpeg"
  },
  {
    "id": "4e2a0bd9-a6a5-4eaa-8c17-5165ccde6f5c",
    "file": "GJS-13.jpeg"
  },
  {
    "id": "e61219fa-7e06-495b-8b55-8a8add82fd40",
    "file": "_missing.png"
  },
  {
    "id": "4d05e77e-d5a0-4534-ad8b-e482cb1941ef",
    "file": "E6013.png"
  },
  {
    "id": "0f983684-3025-4af5-8d93-8976151713bf",
    "file": "3120.png"
  }
]

async function main() {
  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / key')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  let ok = 0
  let skip = 0
  let fail = 0
  const updates = []

  for (const p of PRODUCTS) {
    const local = path.join(IMG_DIR, p.file)
    if (!fs.existsSync(local) || p.file === '_missing.png') {
      skip++
      continue
    }
    const ext = path.extname(p.file).toLowerCase().replace('.', '') || 'png'
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
    const storagePath = 'eyo/' + p.id + '.' + (ext === 'jpeg' ? 'jpg' : ext)
    const buf = fs.readFileSync(local)
    const { error } = await sb.storage.from('product-photos').upload(storagePath, buf, {
      contentType: mime,
      upsert: true,
      cacheControl: '31536000',
    })
    if (error) {
      console.error('upload fail', p.file, error.message)
      fail++
      continue
    }
    const { data } = sb.storage.from('product-photos').getPublicUrl(storagePath)
    const publicUrl = data.publicUrl
    updates.push({ id: p.id, publicUrl })
    ok++
    if (ok % 25 === 0) console.log('uploaded', ok)
  }

  console.log({ ok, skip, fail, updates: updates.length })

  // Apply photo_url updates via SQL file (works in SQL editor as postgres)
  const sqlLines = [
    '-- EYO HTTPS photo_url updates (from Storage upload)',
    'begin;',
  ]
  for (const u of updates) {
    sqlLines.push(
      "update public.products set photo_url = '" +
        u.publicUrl.replace(/'/g, "''") +
        "', updated_at = now() where id = '" +
        u.id +
        "'::uuid;",
    )
  }
  sqlLines.push("drop policy if exists product_photos_eyo_seed_insert on storage.objects;")
  sqlLines.push("drop policy if exists product_photos_eyo_seed_update on storage.objects;")
  sqlLines.push("drop policy if exists product_photos_eyo_seed_delete on storage.objects;")
  sqlLines.push('commit;')
  sqlLines.push('')
  sqlLines.push('select count(*) as https_eyo_photos from public.products where photo_url like \'%/storage/v1/object/public/product-photos/eyo/%\';')

  const outSql = path.join(ROOT, 'supabase', 'tests', 'eyo_photo_url_updates.sql')
  fs.writeFileSync(outSql, sqlLines.join('\n'), 'utf8')
  console.log('wrote', outSql)
  console.log('NEXT: run that SQL file in the Supabase SQL editor to set HTTPS photo URLs and close temp policies.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
