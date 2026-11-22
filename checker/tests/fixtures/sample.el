;;; sample.el --- A sample package -*- lexical-binding: t; -*-
;; Author: Example Author <author@example.org>
;; Maintainer: Example Maintainer <maintainer@example.org>
;; Homepage: https://example.org/sample
;; Package-Version: 1.0
;; Package-Requires: ()
;; Keywords: tools
;; SPDX-License-Identifier: GPL-3.0-or-later
;;; Commentary:
;; A small fixture package that the checker tests use as a passing example.
;;; Code:
(require 'cl-lib)
(defun sample-command () "Ignore (require 'cl)" ?\))
(defvar sample/value nil)
(defconst sample--private nil)
(defmacro sample () nil)
(provide 'sample)
;;; sample.el ends here
