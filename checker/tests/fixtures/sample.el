;;; sample.el --- A sample package -*- lexical-binding: t; -*-
;; Author: Example Author
;; Maintainer: Example Maintainer
;; Homepage: https://example.org/sample
;; Package-Version: 1.0
;; Package-Requires: ()
;; Keywords: tools
;; SPDX-License-Identifier: GPL-3.0-or-later
;;; Commentary:
;; A small fixture.
;;; Code:
(require 'cl-lib)
(defun sample-command () "Ignore (require 'cl)" ?\))
(defvar sample/value nil)
(defconst sample--private nil)
(defmacro sample () nil)
(provide 'sample)
;;; sample.el ends here
