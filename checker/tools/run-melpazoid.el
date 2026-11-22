;;; run-melpazoid.el --- Print melpazoid's experimental findings per file  -*- lexical-binding: t; -*-

;;; Commentary:

;; Usage: emacs --batch -l run-melpazoid.el MELPAZOID-EL PACKAGE-DIR...
;; Prints PACKAGE<TAB>FILE<TAB>LINE for each line melpazoid reports.

;;; Code:

(require 'cl-lib)
(let ((src (pop command-line-args-left)))
  (with-temp-buffer
    (insert-file-contents src)
    (goto-char (point-min))
    (condition-case nil
        (while t
          (let ((form (read (current-buffer))))
            (unless (eq (car-safe form) 'when) (eval form t))))
      (end-of-file nil))))
(dolist (dir command-line-args-left)
  (let ((name (file-name-nondirectory (directory-file-name dir))))
    (setenv "PACKAGE_MAIN" (concat name ".el"))
    (dolist (file (directory-files dir t "\\.el\\'"))
      (when (melpazoid--check-file-p (file-name-nondirectory file))
        (with-current-buffer (find-file-noselect file)
          (setq melpazoid--pending "")
          (cl-letf (((symbol-function 'melpazoid-commit-pending) #'ignore))
            (melpazoid-check-experimentals))
          (dolist (line (split-string melpazoid--pending "\n" t))
            (princ (format "%s\t%s\t%s\n" name (file-name-nondirectory file) line)))
          (kill-buffer))))))
(setq command-line-args-left nil)

;;; run-melpazoid.el ends here
