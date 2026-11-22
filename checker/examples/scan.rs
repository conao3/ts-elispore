use elispore_check::scanner;
fn main() {
    for dir in std::env::args().skip(1) {
        let name = std::path::Path::new(&dir)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let mut entries: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect();
        entries.sort();
        for path in entries {
            let file = path.file_name().unwrap().to_string_lossy().into_owned();
            if !file.ends_with(".el") || file.ends_with("-pkg.el") {
                continue;
            }
            let text = String::from_utf8_lossy(&std::fs::read(&path).unwrap()).into_owned();
            match scanner::scan(&file, &text, &name) {
                Ok(f) => {
                    if f.missing_sharp_quote {
                        println!("{name}\t{file}\tsharp-quote");
                    }
                    for id in f.advice {
                        println!("{name}\t{file}\t{id}");
                    }
                }
                Err(e) => println!("{name}\t{file}\tERROR {e:#}"),
            }
        }
    }
}
