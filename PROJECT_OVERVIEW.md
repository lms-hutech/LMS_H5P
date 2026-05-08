# LMS_H5P Project Overview

## 1. Tổng quan project

### Mục đích
`LMS_H5P` là một bộ source TypeScript/Node.js cho H5P server, được đóng gói dưới dạng monorepo. Dự án là một public-safe export của một workspace H5P dùng cho Canvas LMS và các thử nghiệm với LTI 1.3.

Dự án cung cấp:
- core H5P server library
- Express adapter cho H5P
- ví dụ server để chạy editor/player
- adapter lưu trữ MongoDB/S3 và Redis lock
- các thành phần mở rộng như HTML exporter, SVG sanitizer, ClamAV scanner

### Công nghệ sử dụng
- Backend: Node.js (TypeScript), Express
- Frontend: H5P browser-side assets, static HTML, React (trong `packages/h5p-examples`), web components
- Database/Storage: tùy chọn local filesystem, MongoDB, S3-compatible storage
- Cache/lock: tùy chọn Redis
- Monorepo: npm workspaces + Lerna

### Cách tiếp cận chính
Dự án dùng kiến trúc module/interface-based:
- `packages/h5p-server` là core library, khai báo interface cho storage, permission, translation, lock, file sanitizer
- `packages/h5p-express` là adapter HTTP cho Express, ánh xạ endpoint H5P sang router
- `packages/h5p-examples` là demo implementation, kết hợp `h5p-server`, `h5p-express`, và các adapter lưu trữ/thanh toán
- Storage và extension được tách riêng, nên có thể thay thế dễ dàng bằng các implementation khác

## 2. Cấu trúc thư mục

### Root
- `README.md`: mô tả tổng quan repo, cách cài đặt, cấu trúc package quan trọng
- `package.json`: định nghĩa workspace và script chung
- `lerna.json`: cấu hình Lerna cho monorepo
- `docs/`: tài liệu dùng chung, bao gồm overview, các hướng dẫn phát triển và tích hợp
- `scripts/`: tập script hỗ trợ setup, ví dụ và cấu hình môi trường

### `packages/`
- `h5p-server/`: core H5P server library
  - `src/`: logic cốt lõi
    - `H5PEditor.ts`: đối tượng trung tâm điều phối việc lưu/chỉnh sửa nội dung H5P
    - `H5PPlayer.ts`: render nội dung H5P thành trang HTML để xem
    - `H5PAjaxEndpoint.ts`: xử lý các AJAX endpoint của H5P
    - `ContentManager.ts`, `ContentStorer.ts`, `LibraryManager.ts`: CRUD và quản lý thư viện, nội dung
    - `ContentTypeCache.ts`, `ContentTypeInformationRepository.ts`: quản lý cache content type / H5P Hub
    - `PackageImporter.ts`, `PackageExporter.ts`: import/export file `.h5p`
    - `implementation/`: các lớp lưu trữ thực thi (filesystem, in-memory) và helper
    - `types.ts`: định nghĩa interface và type dùng chung
- `h5p-express/`: Express integration helpers
  - `src/`: Express router và adapter
    - `H5PAjaxRouter/`: entrypoint cho các route H5P AJAX
    - `LibraryAdministrationRouter/`: quản lý library
    - `ContentTypeCacheRouter/`: endpoint cập nhật cache
    - `ContentUserDataRouter/`: quản lý trạng thái người dùng H5P
    - `FinishedDataRouter/`: endpoint trạng thái hoàn thành
- `h5p-mongos3/`: MongoDB + S3 storage adapters
- `h5p-redis-lock/`: Redis lock provider cho khóa phân tán
- `h5p-html-exporter/`: xuất nội dung H5P thành HTML bundle
- `h5p-svg-sanitizer/`: sanitize SVG trước khi lưu
- `h5p-clamav-scanner/`: kiểm tra file upload bằng ClamAV
- `h5p-webcomponents/`, `h5p-react/`: UI components cho trình chơi/chỉnh sửa H5P trong trình duyệt
- `h5p-examples/`: main runnable example server
- `h5p-rest-example-server/`, `h5p-rest-example-client/`: ví dụ SPA REST client/server

### `packages/h5p-examples`
- `src/express.ts`: khởi tạo Express app, cấu hình middleware, route chính
- `src/createH5PEditor.ts`: tạo đối tượng `H5PEditor` bằng các storage adapter tùy theo env vars
- `src/expressRoutes.ts`: route cho chơi, tạo mới và chỉnh sửa nội dung
- `src/startPageRenderer.ts`: render trang danh sách nội dung demo
- `h5p/`: chứa thư viện H5P core/editor/content được bundling vào app demo
- `.env.example`: config mẫu cho MongoDB, LTI, URL, S3, Redis

## 3. H5P trong project

### H5P là gì?
H5P là một framework nội dung tương tác HTML5 dùng để tạo các nội dung như quiz, interactive video, flashcard, drag-and-drop, v.v. Nội dung H5P được đóng gói dưới dạng file `.h5p` gồm `h5p.json`, `content.json`, thư viện, và tệp media.

### H5P Server là gì và dự án này dùng như thế nào?
H5P Server trong repo này là package `packages/h5p-server`.
- Nó cung cấp các API để:
  - quản lý thư viện H5P
  - import/export package H5P
  - lưu nội dung và metadata
  - render trang chơi và trang editor
  - xử lý H5P integration object (`window.H5PIntegration`)
- Đây là một thư viện backend chứ không phải sản phẩm hoàn chỉnh; dự án này có thêm phần `packages/h5p-examples` để minh họa cách sử dụng.

### H5P Example là gì?
`packages/h5p-examples` là ví dụ triển khai server-side với Express.
- Chạy server thực tế trên `http://localhost:8080`
- Cung cấp trang start để liệt kê nội dung, xem, tạo mới, sửa và xóa
- Kết hợp H5P editor và player client
- Hỗ trợ cấu hình lưu trữ filesystem, MongoDB/S3, Redis cache/lock, LTI 1.3

### H5P Express là gì và vai trò của nó?
`packages/h5p-express` là adapter cho Express.
- Nó không chứa logic H5P cốt lõi, mà chỉ biến `H5PEditor` và `H5PPlayer` thành các router Express
- Bao gồm các route cho: AJAX H5P, quản lý thư viện, cache content type, trạng thái người dùng, trạng thái hoàn thành
- `h5p-examples` dùng package này để triển khai endpoint H5P một cách nhanh chóng

### Các thành phần liên kết với nhau
- `h5p-server`: core H5P logic
- `h5p-express`: gói route Express cho H5P API
- `h5p-examples`: ứng dụng mẫu khởi tạo `H5PEditor` và `H5PPlayer`, dùng `h5p-express` để mount route
- `h5p-mongos3`, `h5p-redis-lock`, `h5p-svg-sanitizer`, `h5p-clamav-scanner`: adapter bổ sung cho lưu trữ, khóa, bảo mật
- `h5p-html-exporter`: xuất HTML tĩnh từ content
- `h5p-webcomponents` / `h5p-react`: UI component bổ trợ cho frontend

## 4. Phân tích source code

### Luồng hoạt động chính
1. Startup
   - `packages/h5p-examples/src/express.ts` load env và config
   - `createH5PEditor(...)` khởi tạo `H5PEditor` với storage và adapter phù hợp
   - `H5P.H5PPlayer` được tạo để render content
   - Express mount các router của `h5p-express` và các route demo

2. Khi user request
   - `GET /h5p/play/:contentId` → `h5pPlayer.render(contentId, user, language, options)`
     - tìm content, tải metadata, xác định thư viện và phụ thuộc
     - tạo trang HTML có `window.H5PIntegration` chứa thông tin content, URL file JS/CSS, config
   - `GET /h5p/new` / `/h5p/edit/:contentId` → `h5pEditor.render(...)`
     - render page editor H5P
     - page nhận các asset editor từ thư mục `h5p/editor`
   - `POST /h5p/new` / `/h5p/edit/:contentId` → `h5pEditor.saveOrUpdateContent(...)`
     - lưu nội dung, metadata, thư viện liên quan
     - nếu cần, dùng `ContentStorer` để chuyển file temp vào storage chính thức
   - AJAX endpoints (qua `h5pAjaxExpressRouter`)
     - xử lý upload file, load thư viện, save state người dùng, query content types, v.v.

### Các module quan trọng và tương tác
- `H5PEditor`:
  - trung tâm để tạo/chỉnh sửa nội dung H5P
  - dùng các interface `IContentStorage`, `ILibraryStorage`, `ITemporaryFileStorage`, `IContentUserDataStorage`
  - chứa config, storage, cache, lock, sanitizer, scanner
- `H5PPlayer`:
  - xuất HTML cho nội dung H5P đã lưu
  - phối hợp với storage để lấy content và library assets
- `ContentManager` / `ContentStorer`:
  - quản lý lưu trữ nội dung, import/export, validation
- `LibraryManager`:
  - cài đặt và cập nhật thư viện H5P
  - tìm dependencies của content type
- `ContentTypeCache` / `ContentTypeInformationRepository`:
  - cache metadata content type từ H5P Hub
  - hỗ trợ tìm kiếm, versioning, thông tin library
- `H5PAjaxEndpoint`:
  - xử lý request AJAX của H5P editor/player
  - endpoint này được nối với Express trong `h5p-express`

### Cách H5P được load, render và xử lý dữ liệu
- Browser H5P client tải asset từ `packages/h5p-examples/h5p/core` và `packages/h5p-examples/h5p/editor`
- Backend tạo `window.H5PIntegration` gồm:
  - `contents`: content metadata
  - `path`: danh sách file JS/CSS cần load
  - `settings`, `ajax`, `libraryInfo`
- Player/editor client lấy JSON này và khởi tạo H5P instance trong trình duyệt
- Các thao tác editor (lưu, upload, get libraries) thực hiện qua AJAX endpoint
- Khi người dùng hoàn thành tương tác, state có thể được lưu bằng `IContentUserDataStorage`

### Minh họa flow request chính
```ts
// PLAY content
GET /h5p/play/:contentId
const html = await h5pPlayer.render(contentId, user, language, options)
res.send(html)

// EDIT content
GET /h5p/edit/:contentId
const page = await h5pEditor.render(contentId, language, user)
res.send(page)

// SAVE content
POST /h5p/edit/:contentId
const contentId = await h5pEditor.saveOrUpdateContent(
  req.params.contentId,
  req.body.params.params,
  req.body.params.metadata,
  req.body.library,
  req.user
)
res.json({ contentId })
```

## 5. Kết luận

### Ý nghĩa kiến trúc hiện tại
- Dự án tách rõ ràng giữa H5P core logic và HTTP implementation.
- Mô hình plugin/adapter giúp thay đổi backend storage, cache, lock và media scanner mà không cần sửa code core.
- `packages/h5p-examples` làm nhiệm vụ minh họa cách tích hợp thực tế, nên repo vừa có thư viện reusable vừa có ứng dụng demo.

### Ưu điểm
- modular, dễ mở rộng
- hỗ trợ nhiều backend storage (filesystem, MongoDB, S3)
- hỗ trợ Express qua package adapter chuyên biệt
- có ví dụ chạy được ngay với editor và player
- TypeScript giúp định nghĩa rõ interfaces và giảm lỗi khi phát triển

### Hạn chế
- không phải turnkey H5P server, cần triển khai thêm trong dự án thực tế
- ví dụ demo vẫn dựa nhiều vào server-side rendering và asset bundling thủ công
- cấu hình nhiều env vars, nên cần thiết lập kỹ để chạy đầy đủ MongoDB/S3/Redis/LTI
- bản public export đã loại bỏ dữ liệu demo thực tế và credential, nên cần bổ sung content mẫu nếu muốn chạy ngay